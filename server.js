const express = require('express');
const session = require('express-session');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 3000;

// CẤU HÌNH SUPABASE TRỰC TIẾP
const SUPABASE_URL = 'https://irmjdaxejjxutvkxgwig.supabase.co';
const SUPABASE_KEY = 'sb_publishable_VvitTFe26BJnWm4dqdHr7g_eL6Z6Snt';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
        const { data: adminUser } = await supabase
            .from('users')
            .select('*')
            .eq('username', 'admin')
            .single();

        const hashedPassword = await bcrypt.hash('123456', 10);

        if (!adminUser) {
            await supabase.from('users').insert([
                { username: 'admin', password: hashedPassword, role: 'admin' }
            ]);
            console.log('Đã tạo tài khoản admin mặc định mới (mật khẩu: 123456).');
        } else {
            await supabase.from('users')
                .update({ password: hashedPassword, role: 'admin' })
                .eq('username', 'admin');
            console.log('Đã cập nhật mật khẩu tài khoản admin thành: 123456');
        }
    } catch (err) {
        console.log('Đang chờ kết nối cơ sở dữ liệu Supabase...', err.message);
    }
}
initAdmin();

// ================= API ENDPOINTS CHO ỨNG DỤNG KHÁCH SẠN =================

// Lấy cài đặt khách sạn
app.get('/api/settings', async (req, res) => {
    try {
        const { data, error } = await supabase.from('settings').select('*').limit(1).single();
        if (error || !data) return res.json({});
        res.json(data);
    } catch (e) {
        res.json({});
    }
});

// Lưu cài đặt khách sạn
app.post('/api/settings', async (req, res) => {
    const { name, address, phone, qr_code, promo_text, promo_discount, banners } = req.body;
    try {
        const { data: existing } = await supabase.from('settings').select('id').limit(1).single();
        const payload = {
            name, address, phone, qr_code, promo_text, promo_discount,
            banners: JSON.stringify(banners || [])
        };
        if (existing) {
            await supabase.from('settings').update(payload).eq('id', existing.id);
        } else {
            await supabase.from('settings').insert([payload]);
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Lấy danh sách phòng
app.get('/api/rooms', async (req, res) => {
    try {
        const { data, error } = await supabase.from('rooms').select('*').order('id', { ascending: true });
        if (error) throw error;
        const formatted = (data || []).map(r => ({
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
            await supabase.from('rooms').update({ room_name, price_per_night }).eq('id', id);
        } else {
            await supabase.from('rooms').insert([{ room_name, price_per_night, status: 'Trống' }]);
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Xóa phòng
app.delete('/api/rooms/:id', async (req, res) => {
    try {
        await supabase.from('rooms').delete().eq('id', req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Đặt phòng (Online / Tại quầy)
app.post('/api/rooms/book', async (req, res) => {
    const { room_id, booking_type, customer_name, customer_phone, customer_cccd, booking_dates, payment_status, payment_method } = req.body;
    try {
        const { data: room } = await supabase.from('rooms').select('*').eq('id', room_id).single();
        if (!room) return res.status(404).json({ error: 'Không tìm thấy phòng' });

        const nights = booking_dates && booking_dates.length > 0 ? booking_dates.length : 1;
        const status = booking_type === 'online' ? 'Chờ xác thực' : 'Đang có khách';

        const { data: setting } = await supabase.from('settings').select('*').limit(1).single();
        const promoDiscount = setting ? Number(setting.promo_discount || 0) : 0;

        const roomTotal = room.price_per_night * nights;
        const discountAmount = Math.round((roomTotal * promoDiscount) / 100);
        const grandTotal = roomTotal - discountAmount;

        await supabase.from('rooms').update({
            status,
            booking_type,
            customer_name,
            customer_phone,
            customer_cccd,
            booking_dates: JSON.stringify(booking_dates || []),
            nights,
            payment_status,
            payment_method
        }).eq('id', room_id);

        res.json({
            success: true,
            preliminaryBill: {
                room_name: room.room_name,
                nights,
                customer_name,
                customer_phone,
                customer_cccd,
                roomTotal,
                discountAmount,
                grandTotal
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Xác thực đơn đặt phòng (Chờ xác thực -> Đã duyệt / Từ chối)
app.post('/api/rooms/verify', async (req, res) => {
    const { room_id, action } = req.body;
    try {
        if (action === 'approve') {
            await supabase.from('rooms').update({
                status: 'Đang có khách',
                payment_status: 'Đã thanh toán'
            }).eq('id', room_id);
        } else {
            await supabase.from('rooms').update({
                status: 'Trống',
                customer_name: null,
                customer_phone: null,
                customer_cccd: null,
                booking_dates: null,
                nights: 0,
                payment_status: 'Chưa thanh toán'
            }).eq('id', room_id);
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Cập nhật trạng thái thanh toán phòng
app.post('/api/rooms/update-status', async (req, res) => {
    const { room_id, payment_status, payment_method } = req.body;
    try {
        await supabase.from('rooms').update({ payment_status, payment_method }).eq('id', room_id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Hủy đặt phòng
app.post('/api/rooms/cancel-booking', async (req, res) => {
    const { room_id } = req.body;
    try {
        await supabase.from('rooms').update({
            status: 'Trống',
            customer_name: null,
            customer_phone: null,
            customer_cccd: null,
            booking_dates: null,
            nights: 0,
            payment_status: 'Chưa thanh toán'
        }).eq('id', room_id);
        await supabase.from('orders').delete().eq('room_id', room_id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Lấy danh sách dịch vụ đã đặt của phòng
app.get('/api/orders/:room_id', async (req, res) => {
    try {
        const { data, error } = await supabase.from('orders').select('*').eq('room_id', req.params.room_id);
        if (error) throw error;
        res.json(data || []);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Lấy bảng giá menu dịch vụ
app.get('/api/menu', async (req, res) => {
    try {
        const { data, error } = await supabase.from('menu').select('*');
        if (error) throw error;
        res.json(data || []);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Thêm dịch vụ cho phòng
app.post('/api/orders', async (req, res) => {
    const { room_id, item_id, quantity } = req.body;
    try {
        const { data: menuItem } = await supabase.from('menu').select('*').eq('id', item_id).single();
        if (!menuItem) return res.status(404).json({ error: 'Món không tồn tại' });

        const qty = Number(quantity) || 1;
        const total_price = menuItem.price * qty;

        await supabase.from('orders').insert([{
            room_id,
            item_name: menuItem.item_name,
            category: menuItem.category,
            unit: menuItem.unit,
            quantity: qty,
            total_price
        }]);

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Checkout Phòng & In Bill
app.post('/api/rooms/checkout', async (req, res) => {
    const { room_id, final_payment_method } = req.body;
    try {
        const { data: room } = await supabase.from('rooms').select('*').eq('id', room_id).single();
        if (!room) return res.status(404).json({ error: 'Phòng không tồn tại' });

        const { data: setting } = await supabase.from('settings').select('*').limit(1).single();
        const { data: orders } = await supabase.from('orders').select('*').eq('room_id', room_id);

        const nights = room.nights || 1;
        const isAlreadyPaidRoom = room.payment_status === 'Đã thanh toán';
        const roomTotal = isAlreadyPaidRoom ? 0 : (room.price_per_night * nights);

        const foodItems = (orders || []).filter(o => o.category === 'food');
        const drinkItems = (orders || []).filter(o => o.category === 'drink');
        const relaxItems = (orders || []).filter(o => o.category === 'relax');
        const otherItems = (orders || []).filter(o => o.category === 'khác' || !o.category);

        const serviceTotal = (orders || []).reduce((sum, o) => sum + (o.total_price || 0), 0);
        const grandTotal = roomTotal + serviceTotal;

        const itemsDetail = JSON.stringify(orders || []);

        await supabase.from('bills').insert([{
            created_date: new Date().toISOString().split('T')[0],
            room_name: room.room_name,
            customer_name: room.customer_name,
            customer_phone: room.customer_phone,
            customer_cccd: room.customer_cccd,
            nights,
            discount: 0,
            room_total: roomTotal,
            grand_total: grandTotal,
            payment_method: final_payment_method,
            items_detail: itemsDetail
        }]);

        await supabase.from('rooms').update({
            status: 'Trống',
            customer_name: null,
            customer_phone: null,
            customer_cccd: null,
            booking_dates: null,
            nights: 0,
            payment_status: 'Chưa thanh toán'
        }).eq('id', room_id);

        await supabase.from('orders').delete().eq('room_id', room_id);

        res.json({
            success: true,
            setting: setting || {},
            report: {
                room_name: room.room_name,
                nights,
                customer_name: room.customer_name,
                customer_phone: room.customer_phone,
                customer_cccd: room.customer_cccd,
                isAlreadyPaidRoom,
                roomTotal,
                grandTotal,
                discountAmount: 0,
                foodItems,
                drinkItems,
                relaxItems,
                otherItems
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Đăng nhập API
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .single();

        if (error || !user) {
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
        const { data: rooms } = await supabase.from('rooms').select('*');
        res.render('index', { rooms: rooms || [] });
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
        const { data: user } = await supabase.from('users').select('*').eq('username', username).single();
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
        const { data: users } = await supabase.from('users').select('id, username, role');

        res.render('admin', { 
            user: req.session.user, 
            users: users || []
        });
    } catch (err) {
        res.status(500).send("Lỗi tải trang quản trị");
    }
});

// Khởi động server
app.listen(PORT, () => {
    console.log(`Server đang chạy tại cổng: ${PORT}`);
});
