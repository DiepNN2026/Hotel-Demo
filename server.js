const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const ExcelJS = require('exceljs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    family: 4
});

pool.connect((err) => {
    if (err) console.error('Lỗi kết nối Database:', err.stack);
    else console.log('Đã kết nối thành công với Supabase!');
});

const initDatabase = async () => {
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username TEXT UNIQUE,
            password TEXT,
            role TEXT DEFAULT 'staff'
        )`);

        await pool.query(`CREATE TABLE IF NOT EXISTS settings (
            id SERIAL PRIMARY KEY,
            name TEXT,
            logo TEXT,
            address TEXT,
            phone TEXT,
            qr_code TEXT,
            banners TEXT,
            promo_text TEXT,
            promo_discount REAL DEFAULT 0
        )`);

        await pool.query(`CREATE TABLE IF NOT EXISTS rooms (
            id SERIAL PRIMARY KEY,
            room_name TEXT,
            price_per_night REAL,
            status TEXT DEFAULT 'Trống',
            booking_type TEXT,
            customer_name TEXT,
            customer_phone TEXT,
            customer_cccd TEXT,
            payment_status TEXT DEFAULT 'Chưa thanh toán',
            payment_method TEXT,
            start_date TEXT,
            booking_dates TEXT DEFAULT '[]'
        )`);

        await pool.query(`CREATE TABLE IF NOT EXISTS menu (
            id SERIAL PRIMARY KEY,
            item_name TEXT,
            category TEXT,
            unit TEXT,
            import_price REAL DEFAULT 0,
            price REAL
        )`);

        await pool.query(`CREATE TABLE IF NOT EXISTS orders (
            id SERIAL PRIMARY KEY,
            room_id INTEGER,
            item_id INTEGER,
            quantity INTEGER,
            total_price REAL
        )`);

        await pool.query(`CREATE TABLE IF NOT EXISTS inventory (
            id SERIAL PRIMARY KEY,
            item_name TEXT,
            category TEXT,
            quantity INTEGER,
            unit TEXT,
            import_price REAL,
            import_date TEXT
        )`);

        await pool.query(`CREATE TABLE IF NOT EXISTS bills (
            id SERIAL PRIMARY KEY,
            room_name TEXT,
            customer_name TEXT,
            customer_phone TEXT,
            customer_cccd TEXT,
            nights INTEGER,
            room_total REAL,
            service_total REAL,
            grand_total REAL,
            paid_room_amount REAL DEFAULT 0,
            payment_method TEXT,
            total_import_cost REAL,
            items_detail TEXT,
            created_date TEXT,
            booking_type TEXT,
            discount REAL DEFAULT 0
        )`);

        await pool.query(`CREATE TABLE IF NOT EXISTS expenses (
            id SERIAL PRIMARY KEY,
            category TEXT,
            amount REAL,
            note TEXT,
            date TEXT
        )`);

        const userCountRes = await pool.query(`SELECT COUNT(*) as count FROM users`);
        if (userCountRes.rows[0] && parseInt(userCountRes.rows[0].count) === 0) {
            await pool.query(`INSERT INTO users (username, password, role) VALUES ('admin', '123456', 'admin')`);
            await pool.query(`INSERT INTO users (username, password, role) VALUES ('nhanvien', '123456', 'staff')`);
            await pool.query(`INSERT INTO settings (name, address, phone, qr_code, promo_text, promo_discount, banners) VALUES 
                ('Khách Sạn Biển Xanh', '123 Đường Bờ Biển, Long Xuyên, An Giang', '0909123456', 
                'https://api.vietqr.io/image/970422-123456789-n5398FP.jpg', 
                'Giảm giá 10% tiền phòng cho khách đặt trực tuyến!', 10, 
                '["https://images.unsplash.com/photo-1566073771259-6a8506099945", "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b"]')`);
            
            await pool.query(`INSERT INTO rooms (room_name, price_per_night, status) VALUES ('Phòng VIP 201', 1200000, 'Trống')`);
            await pool.query(`INSERT INTO rooms (room_name, price_per_night, status) VALUES ('Phòng 101', 500000, 'Trống')`);
            await pool.query(`INSERT INTO rooms (room_name, price_per_night, status) VALUES ('Phòng 102', 600000, 'Trống')`);
            
            await pool.query(`INSERT INTO menu (item_name, category, unit, price) VALUES ('Mì Xào Bò', 'food', 'Đĩa', 45000)`);
            await pool.query(`INSERT INTO menu (item_name, category, unit, price) VALUES ('Nước Yến', 'drink', 'Lon', 20000)`);
            await pool.query(`INSERT INTO menu (item_name, category, unit, price) VALUES ('Massage Thảo Dược', 'relax', 'Suất', 250000)`);
            await pool.query(`INSERT INTO menu (item_name, category, unit, price) VALUES ('Giặt Ủi Quần Áo', 'khác', 'Bộ', 30000)`);
        }
        console.log('Khởi tạo cấu trúc CSDL hoàn tất.');
    } catch (err) {
        console.error('Lỗi khởi tạo CSDL:', err);
    }
};

initDatabase();

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query(`SELECT * FROM users WHERE username = $1 AND password = $2`, [username, password]);
        const row = result.rows[0];
        if (!row) return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu!' });
        res.json({ success: true, user: { username: row.username, role: row.role } });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/users', async (req, res) => {
    try {
        const result = await pool.query(`SELECT id, username, role FROM users`);
        res.json(result.rows || []);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/users/save', async (req, res) => {
    const { id, username, password, role } = req.body;
    try {
        if (id) {
            if (password) await pool.query(`UPDATE users SET username = $1, password = $2, role = $3 WHERE id = $4`, [username, password, role, id]);
            else await pool.query(`UPDATE users SET username = $1, role = $2 WHERE id = $3`, [username, role, id]);
        } else {
            await pool.query(`INSERT INTO users (username, password, role) VALUES ($1, $2, $3)`, [username, password || '123456', role || 'staff']);
        }
        res.json({ success: true });
    } catch (err) { res.status(400).json({ error: 'Lỗi tạo/sửa tài khoản!' }); }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        await pool.query(`DELETE FROM users WHERE id = $1 AND username != 'admin'`, [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/settings', async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM settings LIMIT 1`);
        res.json(result.rows[0] || {});
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/settings', async (req, res) => {
    const { name, address, phone, qr_code, banners, promo_text, promo_discount } = req.body;
    try {
        await pool.query(`UPDATE settings SET name = $1, address = $2, phone = $3, qr_code = $4, banners = $5, promo_text = $6, promo_discount = $7 WHERE id = 1`, 
            [name, address, phone, qr_code, JSON.stringify(banners || []), promo_text || '', promo_discount || 0]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/rooms', async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM rooms ORDER BY id ASC`);
        const updatedRows = (result.rows || []).map(r => {
            try { r.booking_dates_arr = JSON.parse(r.booking_dates || '[]'); } catch(e) { r.booking_dates_arr = []; }
            r.nights = r.booking_dates_arr.length > 0 ? r.booking_dates_arr.length : 1;
            return r;
        });
        res.json(updatedRows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/rooms/save', async (req, res) => {
    const { id, room_name, price_per_night } = req.body;
    try {
        if (id) await pool.query(`UPDATE rooms SET room_name = $1, price_per_night = $2 WHERE id = $3`, [room_name, price_per_night, id]);
        else await pool.query(`INSERT INTO rooms (room_name, price_per_night, status) VALUES ($1, $2, 'Trống')`, [room_name, price_per_night]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/rooms/:id', async (req, res) => {
    try {
        await pool.query(`DELETE FROM rooms WHERE id = $1`, [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/rooms/book', async (req, res) => {
    const { room_id, booking_type, customer_name, customer_phone, customer_cccd, booking_dates, payment_status, payment_method } = req.body;
    try {
        const todayStr = new Date().toISOString().split('T')[0];
        let datesArr = Array.isArray(booking_dates) && booking_dates.length > 0 ? booking_dates : [todayStr];
        
        const roomStatus = (booking_type === 'online') ? 'Chờ xác thực' : 'Đang có khách';

        await pool.query(`UPDATE rooms SET status = $1, booking_type = $2, customer_name = $3, customer_phone = $4, customer_cccd = $5, booking_dates = $6, payment_status = $7, payment_method = $8, start_date = $9 WHERE id = $10`, 
            [roomStatus, booking_type || 'counter', customer_name || 'Khách lẻ', customer_phone || '', customer_cccd || '', JSON.stringify(datesArr), payment_status || 'Chưa thanh toán', payment_method || 'chuyen_khoan', datesArr[0], room_id]);
        
        const settingRes = await pool.query(`SELECT * FROM settings LIMIT 1`);
        const setting = settingRes.rows[0];
        const roomRes = await pool.query(`SELECT * FROM rooms WHERE id = $1`, [room_id]);
        const room = roomRes.rows[0];

        const nights = datesArr.length;
        let roomTotal = nights * room.price_per_night;
        const discountPercent = (booking_type === 'online') ? (setting.promo_discount || 0) : 0;
        const discountAmount = (roomTotal * discountPercent) / 100;
        roomTotal = roomTotal - discountAmount;

        res.json({
            success: true,
            setting: setting || {},
            preliminaryBill: {
                room_name: room.room_name,
                customer_name: room.customer_name,
                customer_phone: room.customer_phone,
                customer_cccd: room.customer_cccd,
                nights,
                roomTotal: roomTotal.toFixed(0),
                discountAmount: discountAmount.toFixed(0),
                grandTotal: roomTotal.toFixed(0)
            }
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/rooms/verify', async (req, res) => {
    const { room_id, action } = req.body;
    try {
        if (action === 'approve') {
            await pool.query(`UPDATE rooms SET status = 'Đang có khách', payment_status = 'Đã thanh toán' WHERE id = $1`, [room_id]);
        } else {
            await pool.query(`UPDATE rooms SET status = 'Trống', booking_type = NULL, customer_name = NULL, customer_phone = NULL, customer_cccd = NULL, payment_status = 'Chưa thanh toán', payment_method = NULL, start_date = NULL, booking_dates = '[]' WHERE id = $1`, [room_id]);
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/rooms/update-status', async (req, res) => {
    const { room_id, payment_status, payment_method } = req.body;
    try {
        await pool.query(`UPDATE rooms SET payment_status = $1, payment_method = $2 WHERE id = $3`, [payment_status, payment_method, room_id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/rooms/cancel-booking', async (req, res) => {
    const { room_id } = req.body;
    try {
        await pool.query(`UPDATE rooms SET status = 'Trống', booking_type = NULL, customer_name = NULL, customer_phone = NULL, customer_cccd = NULL, payment_status = 'Chưa thanh toán', payment_method = NULL, start_date = NULL, booking_dates = '[]' WHERE id = $1`, [room_id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/rooms/checkout', async (req, res) => {
    const { room_id, final_payment_method } = req.body;
    try {
        const settingRes = await pool.query(`SELECT * FROM settings LIMIT 1`);
        const setting = settingRes.rows[0];

        const roomRes = await pool.query(`SELECT * FROM rooms WHERE id = $1`, [room_id]);
        const room = roomRes.rows[0];

        if (!room || room.status === 'Trống' || room.status === 'Chờ xác thực') return res.status(400).json({ error: 'Phòng không khả dụng để checkout!' });

        let datesArr = [];
        try { datesArr = JSON.parse(room.booking_dates || '[]'); } catch(e) {}
        const nights = Math.max(1, datesArr.length);
        let roomTotal = nights * room.price_per_night;

        const isOnline = room.booking_type === 'online';
        const discountPercent = isOnline ? (setting.promo_discount || 0) : 0;
        const discountAmount = (roomTotal * discountPercent) / 100;
        roomTotal = roomTotal - discountAmount;

        const isAlreadyPaidRoom = room.payment_status === 'Đã thanh toán' && room.payment_method === 'chuyen_khoan';
        const paidRoomAmount = isAlreadyPaidRoom ? roomTotal : 0;

        const orderRes = await pool.query(`SELECT o.*, m.item_name, m.category, m.unit, m.import_price FROM orders o JOIN menu m ON o.item_id = m.id WHERE o.room_id = $1`, [room_id]);
        const orderItems = orderRes.rows || [];

        const foodItems = orderItems.filter(i => i.category === 'food');
        const drinkItems = orderItems.filter(i => i.category === 'drink');
        const relaxItems = orderItems.filter(i => i.category === 'relax');
        const otherItems = orderItems.filter(i => i.category === 'khác' || !i.category);

        const serviceTotal = orderItems.reduce((sum, item) => sum + item.total_price, 0);
        const grandTotal = (isAlreadyPaidRoom ? 0 : roomTotal) + serviceTotal;

        const totalImportCost = orderItems.reduce((sum, item) => sum + (item.import_price * item.quantity), 0);
        const currentDate = new Date().toISOString().split('T')[0];

        await pool.query(`INSERT INTO bills (room_name, customer_name, customer_phone, customer_cccd, nights, room_total, service_total, grand_total, paid_room_amount, payment_method, total_import_cost, items_detail, created_date, booking_type, discount) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
            [room.room_name, room.customer_name, room.customer_phone, room.customer_cccd, nights, roomTotal, serviceTotal, grandTotal, paidRoomAmount, final_payment_method || room.payment_method || 'tiền mặt', totalImportCost, JSON.stringify(orderItems), currentDate, room.booking_type || 'counter', discountAmount]);
        
        for (const item of orderItems) {
            await pool.query(`UPDATE inventory SET quantity = GREATEST(0, quantity - $1) WHERE item_name = $2`, [item.quantity, item.item_name]);
        }

        await pool.query(`UPDATE rooms SET status = 'Trống', booking_type = NULL, customer_name = NULL, customer_phone = NULL, customer_cccd = NULL, payment_status = 'Chưa thanh toán', payment_method = NULL, start_date = NULL, booking_dates = '[]' WHERE id = $1`, [room_id]);
        await pool.query(`DELETE FROM orders WHERE room_id = $1`, [room_id]);

        res.json({
            success: true,
            setting: setting || {},
            report: {
                room_name: room.room_name,
                customer_name: room.customer_name,
                customer_phone: room.customer_phone,
                customer_cccd: room.customer_cccd,
                nights,
                price_per_night: room.price_per_night,
                roomTotal: roomTotal.toFixed(0),
                discountAmount: discountAmount.toFixed(0),
                booking_type: room.booking_type || 'counter',
                isAlreadyPaidRoom,
                paidRoomAmount: paidRoomAmount.toFixed(0),
                foodItems,
                drinkItems,
                relaxItems,
                otherItems,
                serviceTotal: serviceTotal.toFixed(0),
                grandTotal: grandTotal.toFixed(0)
            }
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/menu', async (req, res) => {
    try { const result = await pool.query(`SELECT * FROM menu ORDER BY id ASC`); res.json(result.rows || []); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/menu/save', async (req, res) => {
    const { id, item_name, category, unit, import_price, price } = req.body;
    try {
        const cat = category || 'khác';
        if(id) await pool.query(`UPDATE menu SET item_name = $1, category = $2, unit = $3, import_price = $4, price = $5 WHERE id = $6`, [item_name, cat, unit, import_price || 0, price, id]);
        else await pool.query(`INSERT INTO menu (item_name, category, unit, import_price, price) VALUES ($1, $2, $3, $4, $5)`, [item_name, cat, unit, import_price || 0, price]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/menu/:id', async (req, res) => {
    try { await pool.query(`DELETE FROM menu WHERE id = $1`, [req.params.id]); res.json({ success: true }); } 
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/inventory', async (req, res) => {
    try { const result = await pool.query(`SELECT * FROM inventory`); res.json(result.rows || []); } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/inventory/save', async (req, res) => {
    const { id, item_name, category, quantity, unit, import_price } = req.body;
    const currentDate = new Date().toISOString().split('T')[0];
    const cat = category || 'khác';
    try {
        if (id) await pool.query(`UPDATE inventory SET item_name = $1, category = $2, quantity = $3, unit = $4, import_price = $5 WHERE id = $6`, [item_name, cat, quantity, unit, import_price, id]);
        else await pool.query(`INSERT INTO inventory (item_name, category, quantity, unit, import_price, import_date) VALUES ($1, $2, $3, $4, $5, $6)`, [item_name, cat, quantity, unit, import_price, currentDate]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/inventory/:id', async (req, res) => {
    try { await pool.query(`DELETE FROM inventory WHERE id = $1`, [req.params.id]); res.json({ success: true }); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/orders/:room_id', async (req, res) => {
    try {
        const result = await pool.query(`SELECT o.id, m.item_name, m.category, m.unit, o.quantity, o.total_price FROM orders o JOIN menu m ON o.item_id = m.id WHERE o.room_id = $1`, [req.params.room_id]);
        res.json(result.rows || []);
    } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/orders', async (req, res) => {
    const { room_id, item_id, quantity } = req.body;
    try {
        const itemRes = await pool.query(`SELECT price FROM menu WHERE id = $1`, [item_id]);
        const item = itemRes.rows[0];
        if (!item) return res.status(400).json({ error: 'Dịch vụ không tồn tại' });
        const total_price = item.price * quantity;
        await pool.query(`INSERT INTO orders (room_id, item_id, quantity, total_price) VALUES ($1, $2, $3, $4)`, [room_id, item_id, quantity, total_price]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/expenses', async (req, res) => {
    try { const result = await pool.query(`SELECT * FROM expenses`); res.json(result.rows || []); } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/expenses', async (req, res) => {
    const { category, amount, note, date } = req.body;
    const expenseDate = date || new Date().toISOString().split('T')[0];
    try {
        await pool.query(`INSERT INTO expenses (category, amount, note, date) VALUES ($1, $2, $3, $4)`, [category, amount, note, expenseDate]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/reports/revenue', async (req, res) => {
    const { start_date, end_date } = req.query;
    try {
        let billQuery = `SELECT SUM(grand_total) as totalRevenue, SUM(paid_room_amount) as totalPaidRoom FROM bills`;
        let expQuery = `SELECT category, SUM(amount) as totalExp FROM expenses`;
        let params = [];

        if (start_date && end_date) {
            billQuery += ` WHERE created_date BETWEEN $1 AND $2`;
            expQuery += ` WHERE date BETWEEN $1 AND $2`;
            params = [start_date, end_date];
        }
        expQuery += ` GROUP BY category`;

        const billRes = await pool.query(billQuery, params);
        const invRes = await pool.query(`SELECT SUM(quantity * import_price) as totalInventoryValue FROM inventory`);
        const expRes = await pool.query(expQuery, params);

        const totalRevenue = Number(billRes.rows[0]?.totalrevenue || 0) + Number(billRes.rows[0]?.totalpaidroom || 0);
        const totalImport = invRes.rows[0]?.totalinventoryvalue || 0;
        const grossProfit = totalRevenue - totalImport;

        let expenses = { 'Lương': 0, 'Điện': 0, 'Nước': 0, 'Thiết bị': 0, 'Mặt bằng': 0, 'Khác': 0 };
        let totalExpense = 0;
        (expRes.rows || []).forEach(e => {
            expenses[e.category] = Number(e.totalexp) || 0;
            totalExpense += Number(e.totalexp) || 0;
        });

        const netProfit = grossProfit - totalExpense;
        res.json({ totalRevenue, totalImport, grossProfit, expenses, totalExpense, netProfit });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/reports/bills-detail', async (req, res) => {
    const { start_date, end_date } = req.query;
    try {
        let query = `SELECT * FROM bills`;
        let params = [];
        if (start_date && end_date) {
            query += ` WHERE created_date BETWEEN $1 AND $2`;
            params = [start_date, end_date];
        }
        query += ` ORDER BY id DESC`;
        const result = await pool.query(query, params);
        res.json(result.rows || []);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/reports/export-excel', async (req, res) => {
    const { start_date, end_date } = req.query;
    try {
        let billQuery = `SELECT * FROM bills`;
        let expQuery = `SELECT * FROM expenses`;
        let params = [];
        if (start_date && end_date) {
            billQuery += ` WHERE created_date BETWEEN $1 AND $2`;
            expQuery += ` WHERE date BETWEEN $1 AND $2`;
            params = [start_date, end_date];
        }

        const billRes = await pool.query(billQuery, params);
        const invRes = await pool.query(`SELECT * FROM inventory`);
        const expRes = await pool.query(expQuery, params);

        const workbook = new ExcelJS.Workbook();
        const thinBorder = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        const styleSheetTable = (sheet) => {
            sheet.views = [{ showGridLines: true }];
            sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
                row.eachCell({ includeEmpty: true }, (cell) => {
                    cell.border = thinBorder;
                    if (rowNumber === 1) {
                        cell.font = { bold: true, color: { argb: 'FFFFFF' } };
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2E7D32' } };
                        cell.alignment = { horizontal: 'center', vertical: 'middle' };
                    }
                });
            });
        };

        const wsBills = workbook.addWorksheet('ChiTiet_HoaDon');
        wsBills.columns = [
            { header: 'ID', key: 'id', width: 8 }, { header: 'Ngày', key: 'created_date', width: 12 },
            { header: 'Phòng', key: 'room_name', width: 15 }, { header: 'Khách hàng', key: 'customer_name', width: 20 },
            { header: 'CCCD', key: 'customer_cccd', width: 15 }, { header: 'Loại đơn', key: 'booking_type', width: 12 },
            { header: 'Số đêm', key: 'nights', width: 8 }, { header: 'Giảm giá', key: 'discount', width: 12 },
            { header: 'Tổng thanh toán', key: 'grand_total', width: 18 }, { header: 'Thanh toán', key: 'payment_method', width: 15 }
        ];
        (billRes.rows || []).forEach(b => wsBills.addRow(b));
        styleSheetTable(wsBills);

        const wsInv = workbook.addWorksheet('KhoHang_TonKho');
        wsInv.columns = [
            { header: 'Tên hàng', key: 'item_name', width: 25 }, { header: 'Danh mục', key: 'category', width: 12 },
            { header: 'Tồn kho', key: 'quantity', width: 10 }, { header: 'Đơn vị', key: 'unit', width: 10 },
            { header: 'Giá nhập', key: 'import_price', width: 15 }
        ];
        (invRes.rows || []).forEach(i => wsInv.addRow(i));
        styleSheetTable(wsInv);

        const wsExp = workbook.addWorksheet('ChiPhi');
        wsExp.columns = [
            { header: 'Ngày', key: 'date', width: 12 }, { header: 'Loại chi phí', key: 'category', width: 20 },
            { header: 'Số tiền', key: 'amount', width: 15 }, { header: 'Ghi chú', key: 'note', width: 30 }
        ];
        (expRes.rows || []).forEach(e => wsExp.addRow(e));
        styleSheetTable(wsExp);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=BaoCao_KhachSan.xlsx');
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, () => { console.log(`Server đang chạy tại http://localhost:${PORT}`); });
