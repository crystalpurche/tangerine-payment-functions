 netlify/functions/create-order.js
// Netlify Function: Create Mollie Order
exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Get environment variables - JE MOET DEZE INSTELLEN IN NETLIFY!
    const mollieApiKey = process.env.MOLLIE_API_KEY; // test_dHar4XY7LxsDOtmnkVtjNVWXLSlXsM
    const webhookUrl = process.env.WEBHOOK_URL; // https://jouw-app.netlify.app/.netlify/functions/webhook

    if (!mollieApiKey || !webhookUrl) {
      throw new Error('Mollie API key of webhook URL niet geconfigureerd');
    }

    // Parse request body
    const data = JSON.parse(event.body);
    const { customerInfo, packageDetails, amounts, discountCode, discountPercentage, newsletter } = data;

    // Validate required fields
    if (!customerInfo || !packageDetails || !amounts) {
      throw new Error('Verplichte velden ontbreken');
    }

    // Generate unique order number
    const orderNumber = `CP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    // Prepare Mollie order data
    const orderData = {
      amount: {
        currency: 'EUR',
        value: amounts.total.toFixed(2)
      },
      orderNumber: orderNumber,
      lines: [
        {
          name: `${packageDetails.name} - ${packageDetails.description}`,
          quantity: parseInt(packageDetails.quantity),
          unitPrice: {
            currency: 'EUR',
            value: packageDetails.pricePerUnit.toFixed(2)
          },
          totalAmount: {
            currency: 'EUR',
            value: amounts.subtotal.toFixed(2)
          },
          vatRate: '21.00',
          vatAmount: {
            currency: 'EUR',
            value: amounts.vat.toFixed(2)
          }
        }
      ],
      billingAddress: {
        organizationName: customerInfo.company,
        givenName: customerInfo.firstName,
        familyName: customerInfo.lastName,
        email: customerInfo.email,
        phone: customerInfo.phone || null,
        streetAndNumber: customerInfo.address,
        postalCode: customerInfo.postalCode,
        city: customerInfo.city,
        country: customerInfo.country
      },
      shippingAddress: {
        organizationName: customerInfo.company,
        givenName: customerInfo.firstName,
        familyName: customerInfo.lastName,
        email: customerInfo.email,
        phone: customerInfo.phone || null,
        streetAndNumber: customerInfo.address,
        postalCode: customerInfo.postalCode,
        city: customerInfo.city,
        country: customerInfo.country
      },
      redirectUrl: 'https://crystalpurche.com/bedankt',
      webhookUrl: webhookUrl,
      metadata: {
        order_source: 'Crystal Purche Website',
        discount_code: discountCode || null,
        discount_percentage: discountPercentage || 0,
        discount_amount: amounts.discount.toFixed(2),
        newsletter_signup: newsletter ? 'yes' : 'no',
        kvk_number: customerInfo.kvk || null,
        order_date: new Date().toISOString(),
        customer_ip: event.headers['x-forwarded-for'] || 'unknown'
      }
    };

    // Add discount line if applicable
    if (amounts.discount > 0) {
      orderData.lines.push({
        name: `Kortingsactie: ${discountCode || 'Korting'}`,
        quantity: 1,
        unitPrice: {
          currency: 'EUR',
          value: `-${amounts.discount.toFixed(2)}`
        },
        totalAmount: {
          currency: 'EUR',
          value: `-${amounts.discount.toFixed(2)}`
        },
        vatRate: '21.00',
        vatAmount: {
          currency: 'EUR',
          value: `-${(amounts.discount * 0.21).toFixed(2)}`
        }
      });
    }

    // Call Mollie API
    const mollieResponse = await fetch('https://api.mollie.com/v2/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mollieApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(orderData)
    });

    if (!mollieResponse.ok) {
      const errorData = await mollieResponse.json();
      throw new Error(`Mollie API Error: ${errorData.detail || 'Unknown error'}`);
    }

    const order = await mollieResponse.json();

    console.log(`Crystal Purche Order Created: ${order.id} - ${orderNumber}`);

    // Return checkout URL
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        order_id: order.id,
        order_number: orderNumber,
        checkout_url: order._links.checkout.href,
        amount: order.amount.value
      })
    };

  } catch (error) {
    console.error('Crystal Purche Order Error:', error.message);
    
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};
