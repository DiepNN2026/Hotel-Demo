const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 3000;

// CẤU HÌNH KẾT NỐI POSTGRESQL (SUPABASE PORT 6543)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres.irmjdaxejjxutvkxgwig:Mật_Khẩu_Của_Bạn@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres',
    ssl: { rejectUnauthorized: false } // Bắt buộc đối với Supabase cloud
});

// Cấu hình lưu trữ ảnh upload tạm thời
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
    secret: 'nguyen-ngoc-diep-supabase-secret',
    resave: false,
    saveUninitialized: false
}));

// Tự động khởi tạo hoặc cập nhật tài khoản quản trị admin / 123456
async function initAdmin() {
    try {
        const client = await pool.connect();
        const resUser = await client.query('SELECT * FROM users WHERE username = $1', ['admin']);
        const adminUser = resUser.rows[0];

        const hashedPassword = await bcrypt.hash('123456', 10);

        if (!adminUser) {
            await client.query('INSERT INTO users (username, password, role) VALUES ($1, $2, $3)', ['admin', hashedPassword, 'admin']);
            console.log('Đã tạo tài khoản admin mặc định mới (mật khẩu: 123456).');
        } else {
            await client.query('UPDATE users SET password = $1, role = $2 WHERE username = $3', [hashedPassword, 'admin', 'admin']);
            console.log('Đã cập nhật mật khẩu tài khoản admin thành: 123456');
        }
        client.release();
    } catch (err) {
        console.log('Đang chờ kết nối cơ sở dữ liệu Supabase...', err.message);
    }
}
initAdmin();

// ================= API ENDPOINTS CHO ỨNG DỤNG KHÁCH SẠN =================

// Lấy cài đặt khách sạn
app.get('/api/settings', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM settings LIMIT 1');
        res.json(result.rows[0] || {});
    } catch (e) {
        res.json({});
    }
});

// Lưu cài đặt khách sạn
app.post('/api/settings', async (req, res) => {
    const { name, address, phone, qr_code, promo_text, promo_discount, banners } = req.body;
    try {
        const client = await pool.connect();
        const existing = await client.query('SELECT id FROM settings LIMIT 1');
        const bannersJson = JSON.stringify(banners || []);

        if (existing.rows.length > 0) {
            await client.query(
                `UPDATE settings SET name = $1, address = $2, phone = $3, qr_code = $4, promo_text = $5, promo_discount = $6, banners = $7 WHERE id = $8`,
                [name, address, phone, qr_code, promo_text, promo_discount, bannersJson, existing.rows[0].id]
            );
        } else {
            await client.query(
                `INSERT INTO settings (name, address, phone, qr_code, promo_text, promo_discount, banners) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [name, address, phone, qr_code, promo_text, promo_discount, bannersJson]
            );
        }
        client.release();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Lấy danh sách phòng
app.get('/api/rooms', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM rooms ORDER BY id ASC');
        const formatted = (result.rows || []).map(r => ({
            ...r,
            booking_dates_arr: r.booking_dates ? JSON.parse(r.booking_dates) : []
        }));
        res.json(formatted);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Lưu / Thêm / Sửa phòng
app.post('/api/rooms/save', async (req, res) => {
    const { id, room_name, price_per_night } = req.body;
    try {
        if (id) {
            await pool.query('UPDATE rooms SET room_name = $1, price_per_night = $2 WHERE id = $3', [room_name, price_per_night, id]);
        } else {
            await pool.query('INSERT INTO rooms (room_name, price_per_night, status) VALUES ($1, $2, $3)', [room_name, price_per_night, 'Trống']);
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Xóa phòng
app.delete('/api/rooms/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM rooms WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ================= API ĐỌC TOÀN BỘ DỮ LIỆU CŨ (BILLS, USERS, MENU, ORDERS) =================

// 1. Lấy lịch sử tất cả các hóa đơn cũ (Bảng bills)
app.get('/api/bills', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM bills ORDER BY id DESC');
        const formattedBills = (result.rows || []).map(bill => ({
            ...bill,
            items_detail: typeof bill.items_detail === 'string' ? JSON.parse(bill.items_detail) : bill.items_detail
        }));
        res.json(formattedBills);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 2. Lấy thống kê tổng quan doanh thu cũ
app.get('/api/statistics/revenue', async (req, res) => {
    try {
        const result = await pool.query('SELECT grand_total, created_date FROM bills');
        let totalRevenue = 0;
        const revenueByDate = {};

        (result.rows || []).forEach(bill => {
            const amount = Number(bill.grand_total) || 0;
            totalRevenue += amount;
            
            const date = bill.created_date || 'Khác';
            if (!revenueByDate[date]) {
                revenueByDate[date] = 0;
            }
            revenueByDate[date] += amount;
        });

        res.json({
            totalRevenue,
            totalBills: result.rows.length,
            revenueByDate
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 3. Lấy thực đơn (Bảng menu)
app.get('/api/menu', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM menu ORDER BY id ASC');
        res.json(result.rows || []);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 4. Lấy danh sách dịch vụ đặt phòng (Bảng orders)
app.get('/api/orders/:room_id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM orders WHERE room_id = $1', [req.params.room_id]);
        res.json(result.rows || []);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Đăng nhập API
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        const user = result.rows[0];

        if (!user) {
            return res.status(400).json({ error: 'Tài khoản hoặc mật khẩu không đúng!' });
        }

        const match = await bcrypt.compare(password, user.password);
        if (match) {
            req.session.user = user;
            res.json({ success: true, user: { id: user.id, username: user.username, role: user.role } });
        } else {
            res.status(400).json({ error: 'Tài khoản hoặc mật khẩu không đúng!' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Lỗi hệ thống đăng nhập!' });
    }
});

// ================= ROUTER VÀ ĐƯỜNG DẪN TRANG =================

app.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM rooms');
        res.render('index', { rooms: result.rows || [] });
    } catch (err) {
        res.render('index', { rooms: [] });
    }
});

app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        const user = result.rows[0];
        if (!user) return res.render('login', { error: 'Tên đăng nhập hoặc mật khẩu không đúng!' });

        const match = await bcrypt.compare(password, user.password);
        if (match) {
            req.session.user = user;
            res.redirect('/admin');
        } else {
            res.render('login', { error: 'Tên đăng nhập hoặc mật khẩu không đúng!' });
        }
    } catch (err) {
        res.render('login', { error: 'Lỗi hệ thống đăng nhập!' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

app.get('/admin', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    try {
        const result = await pool.query('SELECT id, username, role FROM users');
        res.render('admin', { 
            user: req.session.user, 
            users: result.rows || []
        });
    } catch (err) {
        res.status(500).send("Lỗi tải trang quản trị");
    }
});

// Khởi động server
app.listen(PORT, () => {
    console.log(`Server đang chạy tại cổng: ${PORT}`);
});
