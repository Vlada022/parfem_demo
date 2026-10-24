import os
import sqlite3
import hashlib
import secrets
import json
from datetime import datetime
from functools import wraps
from flask import Flask, render_template, request, jsonify, session, redirect, url_for, send_from_directory
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.secret_key = 'parfimersm-secret-2024-xk92jd'

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'parfimersm.db')
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'static', 'uploads')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp', 'gif'}

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# ── DB ──────────────────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()
    c.executescript('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'guest'
        );

        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            brand TEXT NOT NULL,
            description TEXT,
            ml INTEGER NOT NULL,
            price REAL NOT NULL,
            image TEXT,
            stock INTEGER DEFAULT 100,
            active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT NOT NULL,
            street TEXT NOT NULL,
            street_number TEXT NOT NULL,
            city TEXT NOT NULL,
            postal_code TEXT NOT NULL,
            note TEXT,
            status TEXT DEFAULT 'u_pripremi',
            total REAL NOT NULL,
            items_json TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
    ''')

    # Admin user
    pw_hash = hashlib.sha256('admintest123'.encode()).hexdigest()
    c.execute("INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)",
              ('admintest123', pw_hash, 'admin'))

    # Sample products
    sample = [
        ('L\'Homme', 'Prada', 'Sofisticiran muški miris sa notama ambra, tonke i cedrovina. Elegantan i moderan.', 10, 990, 'https://images.unsplash.com/photo-1541643600914-78b084683702?w=400'),
        ('L\'Homme', 'Prada', 'Sofisticiran muški miris sa notama ambra, tonke i cedrovina. Elegantan i moderan.', 20, 1690, 'https://images.unsplash.com/photo-1541643600914-78b084683702?w=400'),
        ('Bleu de Chanel', 'Chanel', 'Slobodan i moderan. Svež citrusni uvod sa dubokom drvenom bazom. Klasik savremene parfumerije.', 5, 790, 'https://images.unsplash.com/photo-1588776814546-1ffedbe34aa6?w=400'),
        ('Bleu de Chanel', 'Chanel', 'Slobodan i moderan. Svež citrusni uvod sa dubokom drvenom bazom. Klasik savremene parfumerije.', 10, 1290, 'https://images.unsplash.com/photo-1588776814546-1ffedbe34aa6?w=400'),
        ('Sauvage', 'Dior', 'Brutalan i harizmatičan. Bergamot i paprika na sivoj ambrovoj bazi. Najtraženiji muški parfem.', 5, 750, 'https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=400'),
        ('Sauvage', 'Dior', 'Brutalan i harizmatičan. Bergamot i paprika na sivoj ambrovoj bazi. Najtraženiji muški parfem.', 10, 1190, 'https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=400'),
        ('La Vie Est Belle', 'Lancôme', 'Slatki cvetni gourmand. Iris, jasman i pačuli sa karamelnom bazom. Ženski klasik.', 5, 690, 'https://images.unsplash.com/photo-1615634260167-c8cdede054de?w=400'),
        ('La Vie Est Belle', 'Lancôme', 'Slatki cvetni gourmand. Iris, jasman i pačuli sa karamelnom bazom. Ženski klasik.', 10, 1090, 'https://images.unsplash.com/photo-1615634260167-c8cdede054de?w=400'),
        ('Oud Wood', 'Tom Ford', 'Luksuzni drveni miris sa retkim oudom, ružinim drvetom i kardamomom. Ekskluzivnost u flašici.', 5, 1490, 'https://images.unsplash.com/photo-1563170351-be82bc888aa4?w=400'),
        ('Black Orchid', 'Tom Ford', 'Tamna, sensuelna mešavina crne tartufe, ilang-ilanga i crne orhideje. Upečatljiv i moćan.', 10, 1890, 'https://images.unsplash.com/photo-1563170351-be82bc888aa4?w=400'),
        ('Flower Bomb', 'Viktor & Rolf', 'Eksplozija cveća — jasmana, ruže i frezie na ambrovoj bazi. Sladak i zavodljiv.', 5, 890, 'https://images.unsplash.com/photo-1619994403073-2cec844b8e63?w=400'),
        ('Good Girl', 'Carolina Herrera', 'Dvojna priroda žene. Jagodicevina i kakaovac susreću se sa jasmanom i tonkom. Ikonična boca.', 10, 1290, 'https://images.unsplash.com/photo-1619994403073-2cec844b8e63?w=400'),
    ]
    c.execute("SELECT COUNT(*) FROM products")
    if c.fetchone()[0] == 0:
        c.executemany(
            "INSERT INTO products (name, brand, description, ml, price, image) VALUES (?,?,?,?,?,?)",
            sample
        )

    conn.commit()
    conn.close()

# ── AUTH ─────────────────────────────────────────────────────────────────────

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if session.get('role') != 'admin':
            return jsonify({'error': 'Pristup odbijen'}), 403
    return decorated

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('user_id'):
            return redirect('/admin/login')
        return f(*args, **kwargs)
    return decorated

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# ── PAGES ─────────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/admin')
@login_required
def admin():
    return render_template('admin.html')

@app.route('/admin/login')
def admin_login_page():
    if session.get('role') == 'admin':
        return redirect('/admin')
    return render_template('login.html')

# ── API: AUTH ─────────────────────────────────────────────────────────────────

@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.get_json()
    pw_hash = hashlib.sha256(data.get('password', '').encode()).hexdigest()
    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE username=? AND password=?",
                        (data.get('username'), pw_hash)).fetchone()
    conn.close()
    if user:
        session['user_id'] = user['id']
        session['username'] = user['username']
        session['role'] = user['role']
        return jsonify({'ok': True, 'role': user['role']})
    return jsonify({'error': 'Pogrešno korisničko ime ili lozinka'}), 401

@app.route('/api/logout', methods=['POST'])
def api_logout():
    session.clear()
    return jsonify({'ok': True})

@app.route('/api/me')
def api_me():
    return jsonify({'role': session.get('role', 'guest'), 'username': session.get('username')})

# ── API: PRODUCTS ─────────────────────────────────────────────────────────────

@app.route('/api/products')
def api_products():
    brand = request.args.get('brand', '')
    search = request.args.get('search', '')
    conn = get_db()
    q = "SELECT * FROM products WHERE active=1"
    params = []
    if brand:
        q += " AND LOWER(brand)=LOWER(?)"
        params.append(brand)
    if search:
        q += " AND (LOWER(name) LIKE LOWER(?) OR LOWER(brand) LIKE LOWER(?))"
        params += [f'%{search}%', f'%{search}%']
    q += " ORDER BY brand, name, ml"
    products = conn.execute(q, params).fetchall()
    brands = [r['brand'] for r in conn.execute("SELECT DISTINCT brand FROM products WHERE active=1 ORDER BY brand").fetchall()]
    conn.close()
    return jsonify({'products': [dict(p) for p in products], 'brands': brands})

@app.route('/api/products', methods=['POST'])
def api_add_product():
    if session.get('role') != 'admin':
        return jsonify({'error': 'Pristup odbijen'}), 403
    name = request.form.get('name', '').strip()
    brand = request.form.get('brand', '').strip()
    description = request.form.get('description', '').strip()
    ml = request.form.get('ml', 0)
    price = request.form.get('price', 0)
    stock = request.form.get('stock', 100)

    image_url = ''
    if 'image' in request.files and request.files['image'].filename:
        f = request.files['image']
        if allowed_file(f.filename):
            fname = secrets.token_hex(8) + '.' + f.filename.rsplit('.', 1)[1].lower()
            f.save(os.path.join(app.config['UPLOAD_FOLDER'], fname))
            image_url = '/static/uploads/' + fname
    elif request.form.get('image_url'):
        image_url = request.form.get('image_url')

    conn = get_db()
    conn.execute(
        "INSERT INTO products (name, brand, description, ml, price, image, stock) VALUES (?,?,?,?,?,?,?)",
        (name, brand, description, ml, price, image_url, stock)
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'image_url': image_url})

@app.route('/api/products/<int:pid>', methods=['PUT'])
def api_edit_product(pid):
    if session.get('role') != 'admin':
        return jsonify({'error': 'Pristup odbijen'}), 403
    name = request.form.get('name', '').strip()
    brand = request.form.get('brand', '').strip()
    description = request.form.get('description', '').strip()
    ml = request.form.get('ml', 0)
    price = request.form.get('price', 0)
    stock = request.form.get('stock', 100)
    active = request.form.get('active', '1')

    conn = get_db()
    existing = conn.execute("SELECT * FROM products WHERE id=?", (pid,)).fetchone()
    if not existing:
        conn.close()
        return jsonify({'error': 'Proizvod nije pronađen'}), 404

    image_url = existing['image']
    if 'image' in request.files and request.files['image'].filename:
        f = request.files['image']
        if allowed_file(f.filename):
            fname = secrets.token_hex(8) + '.' + f.filename.rsplit('.', 1)[1].lower()
            f.save(os.path.join(app.config['UPLOAD_FOLDER'], fname))
            image_url = '/static/uploads/' + fname
    elif request.form.get('image_url'):
        image_url = request.form.get('image_url')

    conn.execute(
        "UPDATE products SET name=?, brand=?, description=?, ml=?, price=?, image=?, stock=?, active=? WHERE id=?",
        (name, brand, description, ml, price, image_url, stock, active, pid)
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/products/<int:pid>', methods=['DELETE'])
def api_delete_product(pid):
    if session.get('role') != 'admin':
        return jsonify({'error': 'Pristup odbijen'}), 403
    conn = get_db()
    conn.execute("UPDATE products SET active=0 WHERE id=?", (pid,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

# ── API: ORDERS ───────────────────────────────────────────────────────────────

@app.route('/api/orders', methods=['POST'])
def api_place_order():
    data = request.get_json()
    required = ['full_name', 'email', 'phone', 'street', 'street_number', 'city', 'postal_code', 'items']
    for f in required:
        if not data.get(f):
            return jsonify({'error': f'Polje {f} je obavezno'}), 400
    if not data['items']:
        return jsonify({'error': 'Korpa je prazna'}), 400

    conn = get_db()
    total = sum(item['price'] * item['qty'] for item in data['items'])
    conn.execute(
        "INSERT INTO orders (full_name,email,phone,street,street_number,city,postal_code,note,total,items_json) VALUES (?,?,?,?,?,?,?,?,?,?)",
        (data['full_name'], data['email'], data['phone'], data['street'], data['street_number'],
         data['city'], data['postal_code'], data.get('note',''), total, json.dumps(data['items']))
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/orders')
def api_get_orders():
    if session.get('role') != 'admin':
        return jsonify({'error': 'Pristup odbijen'}), 403
    conn = get_db()
    orders = conn.execute("SELECT * FROM orders ORDER BY created_at DESC").fetchall()
    conn.close()
    result = []
    for o in orders:
        d = dict(o)
        d['items'] = json.loads(d['items_json'])
        result.append(d)
    return jsonify({'orders': result})

@app.route('/api/orders/<int:oid>/status', methods=['PUT'])
def api_update_order_status(oid):
    if session.get('role') != 'admin':
        return jsonify({'error': 'Pristup odbijen'}), 403
    data = request.get_json()
    valid = ['u_pripremi', 'spakovano', 'poslato', 'preuzeto', 'kompletirano']
    status = data.get('status')
    if status not in valid:
        return jsonify({'error': 'Nevažeći status'}), 400
    conn = get_db()
    conn.execute("UPDATE orders SET status=? WHERE id=?", (status, oid))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

# ── API: CONTACT ──────────────────────────────────────────────────────────────

@app.route('/api/contact', methods=['POST'])
def api_contact():
    data = request.get_json()
    if not data.get('name') or not data.get('email') or not data.get('message'):
        return jsonify({'error': 'Sva polja su obavezna'}), 400
    conn = get_db()
    conn.execute("INSERT INTO contacts (name, email, message) VALUES (?,?,?)",
                 (data['name'], data['email'], data['message']))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/contacts')
def api_get_contacts():
    if session.get('role') != 'admin':
        return jsonify({'error': 'Pristup odbijen'}), 403
    conn = get_db()
    contacts = conn.execute("SELECT * FROM contacts ORDER BY created_at DESC").fetchall()
    conn.close()
    return jsonify({'contacts': [dict(c) for c in contacts]})

# ── STATIC ────────────────────────────────────────────────────────────────────

@app.route('/static/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

init_db()

if __name__ == '__main__':
    print("\n✓ Parfimer.SM server pokrenut!")
    print("  http://localhost:5000\n")
    app.run(debug=True, port=5000, host='0.0.0.0')
