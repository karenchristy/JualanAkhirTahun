import { createClient } from "@supabase/supabase-js";

function isPOOpen() {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Jakarta",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
    }).formatToParts(new Date());

    let weekday;
    let hour;

    for (const part of parts) {
        if (part.type === "weekday") weekday = part.value;
        if (part.type === "hour") hour = Number(part.value);
    }

    if (weekday === "Sun") return false;

    if (weekday === "Sat" && hour >= 9) return false;

    return true;
}

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json"
        }
    });
}

function getSupabase(env) {
    return createClient(
        env.SUPABASE_URL,
        env.SUPABASE_SECRET_KEY
    );
}

function createToken() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);

    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

export default {
    async fetch(request, env) {

        const url = new URL(request.url);
        const pathname = url.pathname;

        // ==================================================
        // STATUS PO
        // ==================================================

        if (
            pathname === "/api/status" &&
            request.method === "GET"
        ) {
            return json({
                success: true,
                po_open: isPOOpen()
            });
        }

        // ==================================================
        // LOGIN ADMIN
        // ==================================================

        if (
            pathname === "/api/admin/login" &&
            request.method === "POST"
        ) {
            try {

                const body = await request.json();

                const username = body.username;
                const password = body.password;

                if (
                    username !== env.ADMIN_USERNAME ||
                    password !== env.ADMIN_PASSWORD
                ) {
                    return json({
                        success: false,
                        message: "Username atau password salah."
                    }, 401);
                }

                const token = createToken();

                // Token disimpan sementara di Durable Object/KV
                // pada tahap ini kita menggunakan token yang
                // ditandatangani secara sederhana.

                const encoder = new TextEncoder();

                const key = await crypto.subtle.importKey(
                    "raw",
                    encoder.encode(env.ADMIN_PASSWORD),
                    {
                        name: "HMAC",
                        hash: "SHA-256"
                    },
                    false,
                    ["sign"]
                );

                const signature = await crypto.subtle.sign(
                    "HMAC",
                    key,
                    encoder.encode(token)
                );

                const signatureHex = Array.from(
                    new Uint8Array(signature)
                )
                    .map(b => b.toString(16).padStart(2, "0"))
                    .join("");

                return json({
                    success: true,
                    token: token + "." + signatureHex
                });

            } catch (error) {

                return json({
                    success: false,
                    message: error.message
                }, 500);
            }
        }

        // ==================================================
        // CEK ADMIN
        // ==================================================

        async function requireAdmin() {

            const authorization =
                request.headers.get("Authorization");

            if (!authorization) {
                return false;
            }

            const token =
                authorization.replace("Bearer ", "");

            const parts = token.split(".");

            if (parts.length !== 2) {
                return false;
            }

            const rawToken = parts[0];
            const receivedSignature = parts[1];

            const encoder = new TextEncoder();

            const key = await crypto.subtle.importKey(
                "raw",
                encoder.encode(env.ADMIN_PASSWORD),
                {
                    name: "HMAC",
                    hash: "SHA-256"
                },
                false,
                ["sign"]
            );

            const signature = await crypto.subtle.sign(
                "HMAC",
                key,
                encoder.encode(rawToken)
            );

            const expectedSignature =
                Array.from(new Uint8Array(signature))
                    .map(b => b.toString(16).padStart(2, "0"))
                    .join("");

            return receivedSignature === expectedSignature;
        }

        // ==================================================
        // AMBIL PESANAN ADMIN
        // ==================================================

        if (
            pathname === "/api/orders" &&
            request.method === "GET"
        ) {

            if (!(await requireAdmin())) {
                return json({
                    success: false,
                    message: "Unauthorized"
                }, 401);
            }

            try {

                const supabase = getSupabase(env);

                const {
                    data,
                    error
                } = await supabase
                    .from("orders")
                    .select("*")
                    .order("id", {
                        ascending: false
                    });

                if (error) {
                    return json({
                        success: false,
                        message: "Gagal mengambil pesanan.",
                        error: error.message
                    }, 500);
                }

                return json({
                    success: true,
                    orders: data
                });

            } catch (error) {

                return json({
                    success: false,
                    message: error.message
                }, 500);
            }
        }

        // ==================================================
        // SIMPAN PESANAN
        // ==================================================

        if (
            pathname === "/api/orders" &&
            request.method === "POST"
        ) {

            try {

                if (!isPOOpen()) {

                    return json({
                        success: false,
                        message:
                            "Maaf, kami sudah tutup PO. Silahkan order di minggu berikutnya atau chat admin WA: 0851-XXXXXXXX"
                    }, 400);
                }

                const body = await request.json();

                const {
                    customer_name,
                    whatsapp,
                    items,
                    total,
                    note
                } = body;

                if (
                    !customer_name ||
                    !whatsapp ||
                    !Array.isArray(items) ||
                    items.length === 0 ||
                    total === undefined ||
                    total === null
                ) {

                    return json({
                        success: false,
                        message: "Data pesanan belum lengkap."
                    }, 400);
                }

                const randomNumber =
                    Math.floor(
                        100 + Math.random() * 900
                    );

                const orderNumber =
                    "ORD-" +
                    Date.now().toString().slice(-6) +
                    "-" +
                    randomNumber;

                const supabase = getSupabase(env);

                const {
                    data,
                    error
                } = await supabase
                    .from("orders")
                    .insert({
                        order_number: orderNumber,
                        customer_name: customer_name,
                        whatsapp: whatsapp,
                        items: items,
                        total: Number(total),
                        note: note || "",
                        status: "Menunggu"
                    })
                    .select()
                    .single();

                if (error) {

                    return json({
                        success: false,
                        message:
                            "Gagal menyimpan pesanan ke Supabase.",
                        error: error.message
                    }, 500);
                }

                return json({
                    success: true,
                    order_number: orderNumber,
                    order: data
                });

            } catch (error) {

                return json({
                    success: false,
                    message: "Terjadi kesalahan pada server.",
                    error: error.message
                }, 500);
            }
        }

        // ==================================================
        // UBAH STATUS PESANAN
        // ==================================================

        const statusMatch =
            pathname.match(
                /^\/api\/orders\/([^/]+)\/status$/
            );

        if (
            statusMatch &&
            request.method === "PATCH"
        ) {

            if (!(await requireAdmin())) {
                return json({
                    success: false,
                    message: "Unauthorized"
                }, 401);
            }

            try {

                const id = statusMatch[1];

                const body = await request.json();

                const status = body.status;

                const allowedStatus = [
                    "Menunggu",
                    "Diproses",
                    "Selesai",
                    "Dibatalkan"
                ];

                if (!allowedStatus.includes(status)) {

                    return json({
                        success: false,
                        message: "Status tidak valid."
                    }, 400);
                }

                const supabase = getSupabase(env);

                const {
                    data,
                    error
                } = await supabase
                    .from("orders")
                    .update({
                        status: status
                    })
                    .eq("id", id)
                    .select()
                    .single();

                if (error) {

                    return json({
                        success: false,
                        message: "Gagal mengubah status.",
                        error: error.message
                    }, 500);
                }

                return json({
                    success: true,
                    order: data
                });

            } catch (error) {

                return json({
                    success: false,
                    message: "Gagal mengubah status."
                }, 500);
            }
        }

        // ==================================================
        // WEBSITE HTML
        // ==================================================

        return env.ASSETS.fetch(request);
    }
};