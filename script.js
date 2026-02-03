// --- CONFIGURATION ---
const supabaseUrl = 'https://gucbamtgrxaqftkrkjzn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1Y2JhbXRncnhhcWZ0a3JranpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MzU0MzcsImV4cCI6MjA4NTExMTQzN30.dE93HpYqAWqFqwHvQXFXQj9l7xPHcngIk-McsZHzIok';
// Edge Function is now deployed on the new project
const FUNCTION_URL = 'https://gucbamtgrxaqftkrkjzn.supabase.co/functions/v1/payment-handler';
const RAZORPAY_KEY_ID = "rzp_live_SBHWG9Cel0iWs5";

// Initialize Supabase
let supabaseClient;
try {
    if (window.supabase) {
        supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
    } else {
        console.error("Supabase SDK not loaded");
    }
} catch (e) {
    console.error("Supabase init error", e);
}

// --- THE MAIN FUNCTION ---
async function handleRegister(event) {
    event.preventDefault();
    console.log("2. Button Clicked");

    const btn = document.querySelector('button[type="submit"]');
    btn.innerText = "Processing...";
    btn.disabled = true;

    try {
        // 1. Get Data from HTML
        const name = document.getElementById('student-name').value;
        const schoolName = document.getElementById('school-name').value;
        const email = document.getElementById('email').value;
        const phone = document.getElementById('phone').value;
        const city = document.getElementById('city').value;
        const studentClass = document.getElementById('class').value;

        if (!name || !email || !phone) {
            throw new Error("Please fill in all fields.");
        }


        // 2. Insert into Supabase (USING CORRECT COLUMN NAMES)
        console.log("3. Saving User to Supabase...");
        console.log("Data being sent:", {
            student_name: name,
            email: email,
            phone_number: phone,
            city: city,
            class_grade: studentClass,
            school_name: schoolName,
            payment_status: 'pending'
        });

        const { data, error } = await supabaseClient
            .from('registrations')
            .insert([{
                student_name: name,       // ✅ Matches 'student_name' column
                email: email,
                phone_number: phone,      // ✅ Matches 'phone_number' column
                city: city,
                class_grade: studentClass,// ✅ Matches 'class_grade' column
                school_name: schoolName,
                payment_status: 'pending' // ✅ Defaults to pending
            }])
            .select()
            .single();

        console.log("4. Supabase Response - Data:", data);
        console.log("4. Supabase Response - Error:", error);

        if (error) throw error;

        // 3. Start Payment with the ID we just created
        console.log("5. User saved successfully with ID:", data.id);
        await startPayment(data.id, name, email, phone);

    } catch (err) {
        console.error(err);
        alert("Error: " + err.message);
        btn.innerText = "Register for Workshop →";
        btn.disabled = false;
    }
}

// --- PAYMENT FUNCTION ---
async function startPayment(studentId, name, email, phone) {
    try {
        const response = await fetch(FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`
            },
            // Registration Fee: 250 INR
            body: JSON.stringify({ action: 'create_order', amount: 250, studentId: studentId })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || "Payment Order Failed");
        }

        const orderData = await response.json();

        const options = {
            "key": RAZORPAY_KEY_ID,
            "amount": orderData.amount,
            "currency": "INR",
            "name": "BSP IIT Delhi",
            "description": "Workshop Ticket",
            "order_id": orderData.id,
            "handler": async function (response) {
                // Verify Payment
                console.log("Verifying payment...");
                document.querySelector('button[type="submit"]').innerText = "Verifying...";

                try {
                    const verifyRes = await fetch(FUNCTION_URL, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${supabaseKey}`
                        },
                        body: JSON.stringify({
                            action: 'verify_payment',
                            paymentId: response.razorpay_payment_id,
                            orderId: response.razorpay_order_id,
                            signature: response.razorpay_signature,
                            studentId: studentId
                        })
                    });

                    const result = await verifyRes.json();
                    if (result.status === "success" || verifyRes.ok) {
                        // 1. Get the Ticket ID
                        const ticketId = result.uniqueCode || `BSP-2026-${studentId}`;

                        // 2. Show Text ID
                        document.getElementById('modal-ticket-id').innerText = ticketId;

                        // 3. GENERATE BARCODE
                        try {
                            JsBarcode("#barcode", ticketId, {
                                format: "CODE128",
                                lineColor: "#000000",
                                width: 2,
                                height: 50,
                                displayValue: true // Shows text below bars
                            });
                        } catch (e) {
                            console.error("Barcode error:", e);
                        }

                        // 4. Show Modal
                        const modal = document.getElementById('success-modal');
                        modal.style.display = 'flex';
                        modal.classList.add('active');

                        alert("✅ Registration Successful!");
                    } else {
                        throw new Error(result.message || "Verification Failed");
                    }
                } catch (verifyErr) {
                    alert("Verification Error: " + verifyErr.message);
                } finally {
                    document.querySelector('button[type="submit"]').innerText = "Register for Workshop →";
                    document.querySelector('button[type="submit"]').disabled = false;
                }
            },
            "prefill": { "name": name, "email": email, "contact": phone },
            "theme": { "color": "#00b4d8" }
        };

        const rzp1 = new Razorpay(options);
        rzp1.on('payment.failed', function (response) {
            alert("Payment Failed: " + response.error.description);
            document.querySelector('button[type="submit"]').innerText = "Register for Workshop →";
            document.querySelector('button[type="submit"]').disabled = false;
        });
        rzp1.open();

    } catch (err) {
        alert("Payment Error: " + err.message);
        document.querySelector('button[type="submit"]').innerText = "Register for Workshop →";
        document.querySelector('button[type="submit"]').disabled = false;
    }
}

// Init Modal Close logic just in case
document.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.getElementById('modal-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            document.getElementById('success-modal').style.display = 'none';
            window.location.reload();
        });
    }
});
