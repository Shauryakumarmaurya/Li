// --- CONFIGURATION ---
const supabaseUrl = 'https://ooqdipxxtiqmkwbpgmtn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9vcWRpcHh4dGlxbWt3YnBnbXRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MDE3MTcsImV4cCI6MjA4Mzk3NzcxN30.NNd4TXZC6RhVucT3LxfecNu2AXofmLDEIUipj9RmxXM';
const FUNCTION_URL = `${supabaseUrl}/functions/v1/payment-handler`;
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
    // 1. STOP THE REFRESH (Crucial Step)
    event.preventDefault();
    console.log("🛑 Refresh Stopped. Starting Logic...");

    const btn = document.querySelector('button[type="submit"]');
    const originalText = btn.innerText;
    btn.innerText = "Processing...";
    btn.disabled = true;

    try {
        // 2. Collect Data
        // NOTE: Adjusted IDs to match index.html
        const name = document.getElementById('student-name')?.value;
        const email = document.getElementById('email')?.value;
        const phone = document.getElementById('phone')?.value;
        const city = document.getElementById('city')?.value || "";
        const studentClass = document.getElementById('class')?.value || "";
        const schoolName = document.getElementById('school-name')?.value || "";

        if (!supabaseClient) throw new Error("Supabase SDK not initialized");

        // 3. Save to Supabase
        const { data, error } = await supabaseClient
            .from('registrations')
            .insert([{
                name: name, email: email, phone: phone,
                city: city, class: studentClass, school_name: schoolName,
                payment_status: 'pending'
            }])
            .select()
            .single();

        if (error) throw error;

        console.log("✅ User Saved. Starting Payment...");

        // 4. Start Payment
        await startPayment(data.id, name, email, phone);

    } catch (err) {
        console.error(err);
        alert("Error: " + err.message);
        btn.innerText = originalText;
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
                        const ticketId = result.uniqueCode || "Confirmed";
                        document.getElementById('modal-ticket-id').innerText = ticketId;
                        document.getElementById('success-modal').style.display = 'flex'; // Adjusted to match HTML ID
                        document.getElementById('success-modal').classList.add('active');
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
