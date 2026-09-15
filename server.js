require("dotenv").config();
const crypto = require("crypto");

const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = 3000;

// ======================================================
// SUPABASE
// ======================================================

const SUPABASE_URL =
    "https://ympayuwfxujzuwfmumuc.supabase.co";

const SUPABASE_KEY =
    process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_KEY) {

    console.error("");
    console.error("======================================");
    console.error("ERROR: SUPABASE_SECRET_KEY BELUM ADA");
    console.error("======================================");
    console.error("");
    console.error("Buat file .env lalu isi:");
    console.error("");
    console.error("SUPABASE_SECRET_KEY=KEY_BARU_KAMU");
    console.error("");

    process.exit(1);
}

const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);


// ======================================================
// MIDDLEWARE
// ======================================================

app.use(express.json());
const adminSessions = new Map();

function createSession() {
    return crypto.randomBytes(32).toString("hex");
}

function requireAdmin(req, res, next) {
    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token || !adminSessions.has(token)) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized"
        });
    }

    next();
}

app.use(express.static(__dirname));


// ======================================================
// LOG SEMUA REQUEST
// ======================================================

app.use((req, res, next) => {

    console.log("");
    console.log("======================================");
    console.log("REQUEST MASUK");
    console.log("Method :", req.method);
    console.log("URL    :", req.url);
    console.log("======================================");

    next();

});


// ======================================================
// TEST SUPABASE
// ======================================================

app.get("/api/test-supabase", async (req, res) => {

    console.log("");
    console.log(">>> TEST SUPABASE DIMULAI <<<");

    try {

        const { data, error } =
            await supabase
                .from("orders")
                .select("id")
                .limit(1);


        if (error) {

            console.error(
                "SUPABASE ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Supabase gagal diakses.",

                error:
                    error.message

            });

        }


        console.log(
            "SUPABASE BERHASIL TERHUBUNG"
        );


        res.json({

            success: true,

            data: data

        });

    }

    catch (error) {

        console.error(
            "TEST SUPABASE ERROR:",
            error
        );


        res.status(500).json({

            success: false,

            message:
                error.message

        });

    }

});


// ======================================================
// CEK PO WIB
// ======================================================

function isPOOpen() {

    const parts =
        new Intl.DateTimeFormat(
            "en-GB",
            {
                timeZone: "Asia/Jakarta",

                weekday: "short",

                hour: "2-digit",

                minute: "2-digit",

                hourCycle: "h23"
            }
        ).formatToParts(
            new Date()
        );


    let weekday;
    let hour;


    for (const part of parts) {

        if (
            part.type === "weekday"
        ) {

            weekday =
                part.value;

        }


        if (
            part.type === "hour"
        ) {

            hour =
                Number(part.value);

        }

    }


    // Minggu = tutup

    if (
        weekday === "Sun"
    ) {

        return false;

    }


    // Sabtu jam 09.00 = tutup

    if (
        weekday === "Sat" &&
        hour >= 9
    ) {

        return false;

    }


    // Senin-Jumat dan
    // Sabtu sebelum jam 09.00 = buka

    return true;

}


// ======================================================
// STATUS PO
// ======================================================

app.get(
    "/api/status",
    (req, res) => {

        const poOpen =
            isPOOpen();


        console.log(
            "STATUS PO:",
            poOpen
                ? "BUKA"
                : "TUTUP"
        );


        res.json({

            success: true,

            po_open:
                poOpen

        });

    }
);

// ======================================================
// LOGIN ADMIN
// ======================================================

app.post("/api/admin/login", (req, res) => {

    const { username, password } = req.body;

    if (
        username !== process.env.ADMIN_USERNAME ||
        password !== process.env.ADMIN_PASSWORD
    ) {
        return res.status(401).json({
            success: false,
            message: "Username atau password salah."
        });
    }

    const token = createSession();

    adminSessions.set(token, {
        createdAt: Date.now()
    });

    res.json({
        success: true,
        token: token
    });
});

// ======================================================
// SIMPAN PESANAN
// ======================================================

app.post(
    "/api/orders",
    async (req, res) => {

        console.log("");
        console.log(
            "======================================"
        );
        console.log(
            ">>> PESANAN MASUK KE SERVER <<<"
        );
        console.log(
            "======================================"
        );


        try {

            // ------------------------------------------
            // CEK PO
            // ------------------------------------------

            if (
                !isPOOpen()
            ) {

                console.log(
                    "PO SUDAH TUTUP"
                );


                return res.status(400).json({

                    success: false,

                    message:
                        "Maaf, kami sudah tutup PO. Silahkan order di minggu berikutnya atau chat admin WA: 0851-XXXXXXXX"

                });

            }


            // ------------------------------------------
            // AMBIL DATA
            // ------------------------------------------

            const {

                customer_name,

                whatsapp,

                items,

                total,

                note

            } = req.body;


            console.log(
                "Nama:",
                customer_name
            );

            console.log(
                "WhatsApp:",
                whatsapp
            );

            console.log(
                "Items:",
                items
            );

            console.log(
                "Total:",
                total
            );

            console.log(
                "Catatan:",
                note
            );


            // ------------------------------------------
            // VALIDASI
            // ------------------------------------------

            if (
                !customer_name ||
                !whatsapp ||
                !Array.isArray(items) ||
                items.length === 0 ||
                total === undefined ||
                total === null
            ) {

                console.log(
                    "DATA PESANAN TIDAK LENGKAP"
                );


                return res.status(400).json({

                    success: false,

                    message:
                        "Data pesanan belum lengkap."

                });

            }


            // ------------------------------------------
            // BUAT NOMOR PESANAN
            // ------------------------------------------

            const randomNumber =
                Math.floor(
                    100 +
                    Math.random() *
                    900
                );


            const orderNumber =
                "ORD-" +
                Date.now()
                    .toString()
                    .slice(-6) +
                "-" +
                randomNumber;


            console.log(
                "Nomor pesanan:",
                orderNumber
            );


            // ------------------------------------------
            // SIMPAN KE SUPABASE
            // ------------------------------------------

            console.log(
                "Mengirim pesanan ke Supabase..."
            );


            const {
                data,
                error
            } = await supabase
                .from("orders")
                .insert({

                    order_number:
                        orderNumber,

                    customer_name:
                        customer_name,

                    whatsapp:
                        whatsapp,

                    items:
                        items,

                    total:
                        Number(total),

                    note:
                        note || "",

                    status:
                        "Menunggu"

                })
                .select()
                .single();


            // ------------------------------------------
            // CEK ERROR SUPABASE
            // ------------------------------------------

            if (error) {

                console.error("");
                console.error(
                    "======================================"
                );
                console.error(
                    "SUPABASE INSERT ERROR"
                );
                console.error(
                    "======================================"
                );
                console.error(
                    error
                );


                return res.status(500).json({

                    success: false,

                    message:
                        "Gagal menyimpan pesanan ke Supabase.",

                    error:
                        error.message

                });

            }


            // ------------------------------------------
            // BERHASIL
            // ------------------------------------------

            console.log("");
            console.log(
                "======================================"
            );
            console.log(
                ">>> PESANAN BERHASIL DISIMPAN <<<"
            );
            console.log(
                "Nomor:",
                orderNumber
            );
            console.log(
                "======================================"
            );


            res.json({

                success: true,

                order_number:
                    orderNumber,

                order:
                    data

            });

        }

        catch (error) {

            console.error("");
            console.error(
                "======================================"
            );
            console.error(
                "SERVER ERROR"
            );
            console.error(
                "======================================"
            );
            console.error(
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Terjadi kesalahan pada server.",

                error:
                    error.message

            });

        }

    }
);


// ======================================================
// AMBIL SEMUA PESANAN
// ======================================================

app.get(
    "/api/orders",
    requireAdmin,
    async (req, res) => {

        console.log(
            "Mengambil pesanan dari Supabase..."
        );


        try {

            const {
                data,
                error
            } = await supabase
                .from("orders")
                .select("*")
                .order(
                    "id",
                    {
                        ascending: false
                    }
                );


            if (error) {

                console.error(
                    "SUPABASE GET ORDERS ERROR:",
                    error
                );


                return res.status(500).json({

                    success: false,

                    message:
                        "Gagal mengambil pesanan.",

                    error:
                        error.message

                });

            }


            console.log(
                "Jumlah pesanan:",
                data.length
            );


            res.json({

                success: true,

                orders:
                    data

            });

        }

        catch (error) {

            console.error(
                "SERVER ERROR:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Terjadi kesalahan pada server."

            });

        }

    }
);


// ======================================================
// UBAH STATUS PESANAN
// ======================================================

app.patch(
    "/api/orders/:id/status",
    async (req, res) => {

        console.log("");
        console.log(
            ">>> UPDATE STATUS PESANAN <<<"
        );


        try {

            const id =
                req.params.id;


            const {
                status
            } = req.body;


            console.log(
                "ID:",
                id
            );

            console.log(
                "Status baru:",
                status
            );


            const allowedStatus = [

                "Menunggu",

                "Diproses",

                "Selesai",

                "Dibatalkan"

            ];


            if (
                !allowedStatus.includes(
                    status
                )
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Status tidak valid."

                });

            }


            // ------------------------------------------
            // UPDATE SUPABASE
            // ------------------------------------------

            const {
                data,
                error
            } = await supabase
                .from("orders")
                .update({

                    status:
                        status

                })
                .eq(
                    "id",
                    id
                )
                .select()
                .single();


            if (error) {

                console.error(
                    "SUPABASE UPDATE ERROR:",
                    error
                );


                return res.status(500).json({

                    success: false,

                    message:
                        "Gagal mengubah status.",

                    error:
                        error.message

                });

            }


            console.log(
                "Status berhasil diubah."
            );


            res.json({

                success: true,

                order:
                    data

            });

        }

        catch (error) {

            console.error(
                "SERVER ERROR:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Gagal mengubah status."

            });

        }

    }
);


// ======================================================
// JALANKAN SERVER
// ======================================================

app.listen(
    PORT,
    () => {

        console.log("");
        console.log(
            "======================================"
        );
        console.log(
            " SERVER BERHASIL DIJALANKAN"
        );
        console.log(
            "======================================"
        );
        console.log("");

        console.log(
            "Website:"
        );

        console.log(
            `http://localhost:${PORT}/HTMLpage1.html`
        );

        console.log("");

        console.log(
            "Admin:"
        );

        console.log(
            `http://localhost:${PORT}/admin.html`
        );

        console.log("");

        console.log(
            "Server siap menerima pesanan."
        );

        console.log("");

    }
);