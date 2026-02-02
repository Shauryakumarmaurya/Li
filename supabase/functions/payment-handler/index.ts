import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import Razorpay from "npm:razorpay@2.9.2"
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";
// Note: standard Razorpay usage in Node.js might use 'crypto' module for HMAC, 
// Deno has 'crypto' Web API globally available or std/crypto. 
// However, the npm:razorpay package usually expects Node.js crypto. 
// We will implement verification manually using Web Crypto API to be safe in Deno Edge Runtime if needed, 
// or trust the library if it works. But for 'verify_payment' logic described, manual HMAC is reliable.

console.log("Payment Handler Function Initialized")

serve(async (req) => {
    // CORS implementation
    if (req.method === 'OPTIONS') {
        return new Response('ok', {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
            }
        })
    }

    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // Parse request body
        const { action, amount, studentId, paymentId, orderId, signature } = await req.json()

        // Initialize Razorpay
        const instance = new Razorpay({
            key_id: "rzp_live_SBHWG9Cel0iWs5",
            key_secret: "mgKfh2af3Ij6cd586Dy0Ny3F",
        })

        if (action === 'create_order') {
            if (!amount || !studentId) {
                throw new Error('Missing amount or studentId')
            }

            const options = {
                amount: amount * 100, // Razorpay expects amount in paise
                currency: "INR",
                receipt: `rcpt_${studentId.slice(0, 5)}_${Date.now()}`,
            };

            const order = await instance.orders.create(options);

            return new Response(JSON.stringify(order), {
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            })
        }

        if (action === 'verify_payment') {
            if (!paymentId || !orderId || !signature || !studentId) {
                throw new Error('Missing verificaton details')
            }

            // Verify signature
            const text = orderId + "|" + paymentId;
            const secret = "mgKfh2af3Ij6cd586Dy0Ny3F";

            const encoder = new TextEncoder();
            const keyData = encoder.encode(secret);
            const msgData = encoder.encode(text);

            const key = await crypto.subtle.importKey(
                "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
            );
            const signatureBuffer = await crypto.subtle.sign("HMAC", key, msgData);
            const signatureHex = Array.from(new Uint8Array(signatureBuffer))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');

            if (signatureHex === signature) {
                // 1. Generate Unique Code (e.g., BSP-2026-105)
                const uniqueCode = `BSP-2026-${studentId}`;

                // 2. Update the Database (Mark as Success)
                const { error } = await supabase
                    .from('registrations')
                    .update({
                        payment_status: 'success',  // ✅ Updates from 'pending' to 'success'
                        payment_id: paymentId,      // ✅ Saves Razorpay Payment ID
                        unique_code: uniqueCode     // ✅ Saves the Ticket Code
                    })
                    .eq('id', studentId);

                if (error) throw error;

                return new Response(
                    JSON.stringify({ status: "success", uniqueCode: uniqueCode }),
                    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            } else {
                return new Response(JSON.stringify({ status: 'failure', message: 'Invalid signature' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                })
            }
        }

        throw new Error(`Unknown action: ${action}`)

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        })
    }
})
