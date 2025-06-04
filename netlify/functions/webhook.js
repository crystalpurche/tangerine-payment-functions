netlify/functions/webhook.js
// Netlify Function: Handle Mollie Webhooks
exports.handler = async (event, context) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    // Get environment variables
    const mollieApiKey = process.env.MOLLIE_API_KEY;
    const emailTo = process.env.EMAIL_TO || 'info@crystalpurche.com';

    if (!mollieApiKey) {
      throw new Error('Mollie API key niet geconfigureerd');
    }

    // Parse webhook data
    const webhookData = new URLSearchParams(event.body);
    const orderId = webhookData.get('id');

    if (!orderId) {
      throw new Error('Geen order ID ontvangen');
    }

    console.log(`Crystal Purche Webhook: Received for order ${orderId}`);

    // Fetch order details from Mollie
    const mollieResponse = await fetch(`https://api.mollie.com/v2/orders/${orderId}`, {
      headers: {
        'Authorization': `Bearer ${mollieApiKey}`
      }
    });

    if (!mollieResponse.ok) {
      throw new Error('Kon order niet ophalen van Mollie');
    }

    const order = await mollieResponse.json();

    console.log(`Crystal Purche Webhook: Order ${order.orderNumber} - Status: ${order.status}`);

    // Only send email for paid orders
    if (order.status === 'paid') {
      await sendOrderEmail(order, emailTo);
    }

    return { statusCode: 200, body: 'OK' };

  } catch (error) {
    console.error('Crystal Purche Webhook Error:', error.message);
    return { statusCode: 200, body: 'Error logged' }; // Always return 200 to avoid Mollie retries
  }
};

async function sendOrderEmail(order, emailTo) {
  try {
    const billing = order.billingAddress;
    const shipping = order.shippingAddress;
    const metadata = order.metadata;

    // Format order date
    const orderDate = new Date(order.createdAt);
    const formattedDate = orderDate.toLocaleDateString('nl-NL', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Calculate totals
    let subtotal = 0;
    let vatTotal = 0;
    let discountTotal = 0;
    const productLines = [];

    order.lines.forEach(line => {
      if (parseFloat(line.unitPrice.value) < 0) {
        // This is a discount line
        discountTotal += Math.abs(parseFloat(line.totalAmount.value));
      } else {
        // Regular product line
        subtotal += parseFloat(line.totalAmount.value);
        vatTotal += parseFloat(line.vatAmount.value);
        productLines.push(line);
      }
    });

    const subject = `🎉 BETALING ONTVANGEN - ${order.orderNumber} - ${billing.organizationName}`;

    const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f9f9f9; }
            .container { max-width: 600px; margin: 0 auto; }
            .header { background: #1a1a1a; color: white; padding: 30px; border-radius: 10px; margin-bottom: 20px; }
            .header h1 { color: #d4af37; margin: 0 0 10px 0; }
            .section { background: white; padding: 25px; border-radius: 10px; margin-bottom: 20px; }
            .paid-section { border-left: 4px solid #22c55e; background: #f0fdf4; }
            .order-section { border-left: 4px solid #d4af37; }
            .customer-section { border-left: 4px solid #3b82f6; }
            .address-section { border-left: 4px solid #10b981; }
            table { width: 100%; border-collapse: collapse; }
            td { padding: 8px 0; }
            .bold { font-weight: bold; }
            .total-row { border-top: 2px solid #d4af37; background: #fef7e3; }
            .address-box { background: #f8fafc; padding: 15px; border-radius: 6px; font-family: monospace; line-height: 1.6; }
            .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
            .paid-badge { background: #22c55e; color: white; padding: 8px 16px; border-radius: 20px; font-weight: bold; display: inline-block; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>💰 Betaling Ontvangen - Crystal Purche!</h1>
                <p style="margin: 0; opacity: 0.9;">Order ID: ${order.orderNumber}</p>
                <p style="margin: 0; opacity: 0.9;">Mollie ID: ${order.id}</p>
                <p style="margin: 0; opacity: 0.9;">Datum: ${formattedDate}</p>
            </div>
            
            <div class="section paid-section">
                <h2 style="color: #333; margin-top: 0;">✅ Betaling Status</h2>
                <p><span class="paid-badge">BETAALD</span></p>
                <p><strong>Betaald bedrag:</strong> €${order.amount.value}</p>
                <p><strong>Betaalmethode:</strong> ${order.method ? order.method.charAt(0).toUpperCase() + order.method.slice(1) : 'Onbekend'}</p>
                <p style="color: #22c55e; font-weight: bold;">🚀 Deze bestelling kan verzonden worden!</p>
            </div>
            
            <div class="section order-section">
                <h2 style="color: #333; margin-top: 0;">📦 Bestelling Details</h2>
                <table>
                    ${productLines.map(line => `
                    <tr><td class="bold">Product:</td><td>${line.name}</td></tr>
                    <tr><td class="bold">Aantal:</td><td>${line.quantity} stuks</td></tr>
                    <tr><td class="bold">Prijs per stuk:</td><td>€${line.unitPrice.value} (excl. BTW)</td></tr>
                    `).join('')}
                    ${metadata.discount_code ? `
                    <tr><td class="bold" style="color: #22c55e;">Kortingscode:</td><td style="color: #22c55e;">${metadata.discount_code} (-${metadata.discount_percentage}%)</td></tr>
                    ` : ''}
                    <tr style="border-top: 1px solid #eee;"><td class="bold">Subtotaal:</td><td>€${subtotal.toFixed(2)}</td></tr>
                    ${discountTotal > 0 ? `
                    <tr><td class="bold" style="color: #22c55e;">Korting:</td><td style="color: #22c55e;">-€${discountTotal.toFixed(2)}</td></tr>
                    ` : ''}
                    <tr><td class="bold">BTW (21%):</td><td>€${vatTotal.toFixed(2)}</td></tr>
                    <tr class="total-row"><td class="bold" style="padding: 12px 8px; font-size: 16px;">TOTAAL BETAALD:</td><td class="bold" style="padding: 12px 8px; font-size: 16px; color: #d4af37;">€${order.amount.value}</td></tr>
                </table>
            </div>
            
            <div class="section customer-section">
                <h2 style="color: #333; margin-top: 0;">👤 Klant Gegevens</h2>
                <table>
                    <tr><td class="bold">Naam:</td><td>${billing.givenName} ${billing.familyName}</td></tr>
                    <tr><td class="bold">Email:</td><td><a href="mailto:${billing.email}">${billing.email}</a></td></tr>
                    ${billing.phone ? `<tr><td class="bold">Telefoon:</td><td><a href="tel:${billing.phone}">${billing.phone}</a></td></tr>` : ''}
                    <tr><td class="bold">Bedrijf:</td><td>${billing.organizationName}</td></tr>
                    ${metadata.kvk_number ? `<tr><td class="bold">KvK:</td><td>${metadata.kvk_number}</td></tr>` : ''}
                    <tr><td class="bold">Nieuwsbrief:</td><td>${metadata.newsletter_signup === 'yes' ? '✅ Ja' : '❌ Nee'}</td></tr>
                </table>
            </div>
            
            <div class="section address-section">
                <h2 style="color: #333; margin-top: 0;">📍 Verzendadres</h2>
                <div class="address-box">
                    <strong>${shipping.organizationName}</strong><br>
                    T.a.v. ${shipping.givenName} ${shipping.familyName}<br>
                    ${shipping.streetAndNumber}<br>
                    ${shipping.postalCode} ${shipping.city}<br>
                    ${shipping.country === 'NL' ? 'Nederland' : shipping.country}
                </div>
            </div>
            
            <div class="footer">
                <p>✅ Deze email bevestigt een succesvolle betaling via Mollie.</p>
                <p>🚀 De bestelling kan direct worden verwerkt en verzonden.</p>
                <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
                <p>Dit is een automatisch gegenereerde email van Crystal Purche order systeem.</p>
            </div>
        </div>
    </body>
    </html>`;

    // Use Netlify's built-in email service or external email API
    // For now, we'll log the email (you can integrate with SendGrid, etc.)
    console.log('📧 EMAIL WOULD BE SENT TO:', emailTo);
    console.log('📧 SUBJECT:', subject);
    console.log('📧 ORDER:', order.orderNumber, '- €' + order.amount.value);

    // TODO: Integrate with actual email service
    // Example with SendGrid:
    // await sendGridMail.send({ to: emailTo, subject, html: htmlBody });

    return true;

  } catch (error) {
    console.error('Failed to send order email:', error);
    return false;
  }
}
