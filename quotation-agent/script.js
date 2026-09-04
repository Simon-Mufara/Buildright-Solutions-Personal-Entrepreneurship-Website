/* BuildRight Solutions - Quotation Agent Script */
/* ------------------------------------------- */
/* Handles form interactions, price estimation, and notifications */

/* Configuration - Replace with your actual credentials */
const EMAILJS_PUBLIC_KEY  = "YOUR_EMAILJS_PUBLIC_KEY"; // TODO: Replace with your EmailJS public key
const EMAILJS_SERVICE_ID  = "YOUR_EMAILJS_SERVICE_ID"; // TODO: Replace with your EmailJS service ID
const EMAILJS_TEMPLATE_ID = "YOUR_EMAILJS_TEMPLATE_ID"; // TODO: Replace with your EmailJS template ID

const CALLMEBOT_PHONE  = "27620555123456"; // TODO: Replace with your WhatsApp number (country code, no + or 0)
const CALLMEBOT_APIKEY = "YOUR_CALLMEBOT_APIKEY"; // TODO: Replace with your CallMeBot API key

/* BRS Connector - real PDF generation & dashboard logging (best-effort, additive) */
/* The site keeps working exactly as before even if this service is offline. */
const BRS_CONNECTOR_URL = "https://YOUR-VERCEL-APP.vercel.app/api/enquiry"; // TODO: set after connector deploys

/* Forward an enquiry to the BRS PDF engine. Never blocks or breaks the form. */
async function sendToBrsConnector(payload) {
    if (!BRS_CONNECTOR_URL || BRS_CONNECTOR_URL.includes("YOUR-VERCEL-APP")) {
        return; // connector not deployed yet - behave exactly as before
    }
    try {
        await fetch(BRS_CONNECTOR_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        console.log("Enquiry forwarded to BRS connector.");
    } catch (err) {
        console.warn("BRS connector unreachable - enquiry still saved locally:", err);
    }
}

/* Current estimate total (R) if the user generated one, else null. */
function currentEstimateTotal() {
    try {
        const raw = estimateTotal && estimateTotal.textContent;
        if (!raw) return null;
        const num = parseFloat(String(raw).replace(/[^0-9.]/g, ""));
        return isNaN(num) ? null : num;
    } catch (e) {
        return null;
    }
}

// Initialize EmailJS if available
if (window.emailjs) {
    emailjs.init(EMAILJS_PUBLIC_KEY);
}

// Price data for estimation (simplified - in production this would come from an API or database)
const PRICE_DATA = {
    tiling: {
        budget: { tiles: 250, adhesive: 45, grout: 35, waterproofing: 120 },
        standard: { tiles: 350, adhesive: 55, grout: 45, waterproofing: 150 },
        premium: { tiles: 500, adhesive: 70, grout: 60, waterproofing: 180 }
    },
    painting: {
        budget: { paint: 120, primer: 80, sandpaper: 20, masking: 15 },
        standard: { paint: 180, primer: 120, sandpaper: 30, masking: 25 },
        premium: { paint: 250, primer: 180, sandpaper: 40, masking: 35 }
    },
    plumbing: {
        budget: { pipes: 200, fittings: 150, fixtures: 800 },
        standard: { pipes: 280, fittings: 200, fixtures: 1200 },
        premium: { pipes: 350, fittings: 280, fixtures: 1800 }
    },
    electrical: {
        budget: { wiring: 150, outlets: 100, fixtures: 200 },
        standard: { wiring: 200, outlets: 150, fixtures: 300 },
        premium: { wiring: 280, outlets: 200, fixtures: 450 }
    },
    carpentry: {
        budget: { wood: 350, hardware: 80, finish: 120 },
        standard: { wood: 450, hardware: 120, finish: 180 },
        premium: { wood: 550, hardware: 180, finish: 250 }
    },
    waterproofing: {
        budget: { membrane: 180, compound: 120, primer: 60 },
        standard: { membrane: 220, compound: 150, primer: 80 },
        premium: { membrane: 280, compound: 180, primer: 100 }
    },
    paving: {
        budget: { pavers: 200, sand: 40, cement: 80, edging: 60 },
        standard: { pavers: 250, sand: 50, cement: 100, edging: 80 },
        premium: { pavers: 320, sand: 60, cement: 120, edging: 100 }
    },
    building: {
        budget: { bricks: 120, cement: 80, sand: 30, steel: 200 },
        standard: { bricks: 150, cement: 100, sand: 40, steel: 250 },
        premium: { bricks: 180, cement: 120, sand: 50, steel: 300 }
    },
    renovation: {
        budget: { demolition: 200, materials: 300, fixtures: 150 },
        standard: { demolition: 250, materials: 400, fixtures: 200 },
        premium: { demolition: 300, materials: 500, fixtures: 250 }
    }
};

// Waste factors for materials
const WASTE_FACTORS = {
    tiling: 0.10, // 10% waste for tiles
    painting: 0.15, // 15% waste for paint (spillage, overlap)
    plumbing: 0.05, // 5% waste for pipes/fittings
    electrical: 0.05, // 5% waste for wiring/conduit
    carpentry: 0.10, // 10% waste for wood
    waterproofing: 0.05, // 5% waste for membranes/compounds
    paving: 0.10, // 10% waste for pavers/blocks
    building: 0.05, // 5% waste for bricks/blocks
    renovation: 0.15 // 15% waste for mixed materials
};

// Labor rates per hour (ZAR)
const LABOR_RATES = {
    tiling: 180,
    painting: 150,
    plumbing: 220,
    electrical: 200,
    carpentry: 170,
    waterproofing: 160,
    paving: 160,
    building: 190,
    renovation: 180
};

// Estimated hours per unit (simplified)
const LABOR_HOURS = {
    tiling: { per: 'm2', hours: 0.8 }, // 0.8 hours per m2
    painting: { per: 'm2', hours: 0.6 }, // 0.6 hours per m2
    plumbing: { per: 'point', hours: 1.0 }, // 1 hour per plumbing point
    electrical: { per: 'point', hours: 0.8 }, // 0.8 hours per electrical point
    carpentry: { per: 'm2', hours: 0.5 }, // 0.5 hours per m2 (rough carpentry)
    waterproofing: { per: 'm2', hours: 0.4 }, // 0.4 hours per m2
    paving: { per: 'm2', hours: 0.7 }, // 0.7 hours per m2
    building: { per: 'm2', hours: 1.2 }, // 1.2 hours per m2 (wall building)
    renovation: { per: 'm2', hours: 1.0 } // 1 hour per m2 (general renovation)
};

/* DOM Elements */
const quotationForm = document.getElementById('quotation-form');
const enquiryForm = document.getElementById('enquiry-form');
const estimateResults = document.getElementById('estimate-results');
const estimateRef = document.getElementById('estimate-ref');
const estimateService = document.getElementById('estimate-service');
const estimateArea = document.getElementById('estimate-area');
const estimateDimensions = document.getElementById('estimate-dimensions');
const estimateQuality = document.getElementById('estimate-quality');
const estimateDetails = document.getElementById('estimate-details');
const estimateSubtotal = document.getElementById('estimate-subtotal');
const estimateVat = document.getElementById('estimate-vat');
const estimateTotal = document.getElementById('estimate-total');
const generateEstimateBtn = document.getElementById('generate-estimate');
const submitEnquiryBtn = document.getElementById('submit-enquiry');
const createQuotationBtn = document.getElementById('create-quotation');
const enquiryStatus = document.getElementById('enquiry-status');
const templatesGrid = document.querySelector('.templates-grid');
const loadMoreTemplatesBtn = document.getElementById('load-more-templates');

/* Tab Switching */
document.querySelectorAll('.tab-btn').forEach(button => {
    button.addEventListener('click', () => {
        const tabId = button.getAttribute('data-tab');

        // Update active tab button
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        button.classList.add('active');

        // Show active tab content
        document.querySelectorAll('.tab-pane').forEach(pane => {
            pane.classList.remove('active');
        });
        document.getElementById(tabId).classList.add('active');
    });
});

/* Quotation Form Handling */
quotationForm.addEventListener('submit', (e) => {
    e.preventDefault();
});

generateEstimateBtn.addEventListener('click', generatePriceEstimate);
submitEnquiryBtn.addEventListener('click', submitAsEnquiry);
createQuotationBtn.addEventListener('click', createProfessionalQuotation);

enquiryForm.addEventListener('submit', handleEnquirySubmit);

/* Generate Price Estimate */
function generatePriceEstimate() {
    // Get form values
    const serviceType = document.getElementById('service-type').value;
    const area = document.getElementById('area').value;
    const dimensions = document.getElementById('dimensions').value;
    const quality = document.getElementById('quality').value;
    const details = document.getElementById('details').value;

    // Validate
    if (!serviceType || !area || !dimensions) {
        showError('Please fill in all required fields');
        return;
    }

    // Generate reference number
    const refNumber = generateReferenceNumber();
    estimateRef.textContent = refNumber;

    // Update summary
    estimateService.textContent = capitalizeFirstLetter(serviceType);
    estimateArea.textContent = area;
    estimateDimensions.textContent = dimensions;
    estimateQuality.textContent = capitalizeFirstLetter(quality);

    // Calculate estimate
    const estimate = calculateEstimate(serviceType, dimensions, quality, details);

    // Display breakdown
    displayEstimateBreakdown(estimate.breakdown);

    // Update totals
    estimateSubtotal.textContent = formatCurrency(estimate.subtotal);
    estimateVat.textContent = formatCurrency(estimate.vat);
    estimateTotal.textContent = formatCurrency(estimate.total);

    // Show results
    estimateResults.classList.remove('hidden');

    // Scroll to results
    estimateResults.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* Calculate Estimate */
function calculateEstimate(serviceType, dimensions, quality, details) {
    // Parse dimensions to extract area/quantity
    const areaValue = extractAreaValue(dimensions);
    const wasteFactor = WASTE_FACTORS[serviceType] || 0.1;
    const laborRate = LABOR_RATES[serviceType] || 150;
    const laborHours = LABOR_HOURS[serviceType]?.hours || 0.5;
    const laborPer = LABOR_HOURS[serviceType]?.per || 'm2';

    // Get base prices for service type and quality
    const basePrices = PRICE_DATA[serviceType]?.[quality] || PRICE_DATA[serviceType]?.standard || {};

    // Calculate material costs
    let materialCost = 0;
    const breakdownItems = [];

    for (const [item, pricePerUnit] of Object.entries(basePrices)) {
        // Calculate quantity needed (this is simplified - real implementation would be more complex)
        let quantity = areaValue;

        // Adjust quantity based on item type (simplified logic)
        if (item.includes('tile') || item === 'tiles') {
            quantity = areaValue * (1 + wasteFactor); // Add waste factor
        } else if (item.includes('paint') || item === 'primer' || item.includes('sandpaper')) {
            quantity = areaValue * (1 + WASTE_FACTORS.painting); // Paint waste factor
        } else if (item.includes('pipe') || item.includes('fitting') || item === 'fixtures') {
            quantity = areaValue * 0.5; // Simplified: 0.5 points per m2
        } else if (item.includes('wire') || item.includes('outlet') || item === 'fixtures') {
            quantity = areaValue * 0.3; // Simplified: 0.3 points per m2
        } else if (item.includes('wood') || item === 'hardware' || item === 'finish') {
            quantity = areaValue * 0.8; // Simplified: 0.8 m2 per m2 area
        } else if (item.includes('membrane') || item.includes('compound') || item.includes('primer')) {
            quantity = areaValue * (1 + WASTE_FACTORS.waterproofing); // Waterproofing waste
        } else if (item.includes('paver') || item.includes('sand') || item.includes('cement') || item === 'edging') {
            quantity = areaValue * (1 + WASTE_FACTORS.paving); // Paving waste
        } else if (item.includes('brick') || item.includes('cement') || item.includes('sand') || item === 'steel') {
            quantity = areaValue * 0.5; // Simplified: 0.5 units per m2 for building
        } else {
            quantity = areaValue; // Default
        }

        const itemCost = pricePerUnit * quantity;
        materialCost += itemCost;

        breakdownItems.push({
            name: formatItemName(item),
            quantity: quantity.toFixed(2) + ' m2',
            unitPrice: formatCurrency(pricePerUnit),
            total: formatCurrency(itemCost)
        });
    }

    // Calculate labor costs
    let laborQuantity = areaValue;
    if (laborPer === 'point') {
        laborQuantity = areaValue * 0.5; // Simplified conversion
    }

    const laborHoursTotal = laborQuantity * laborHours;
    const laborCost = laborHoursTotal * laborRate;

    breakdownItems.push({
        name: 'Labour',
        quantity: laborHoursTotal.toFixed(1) + ' hours',
        unitPrice: formatCurrency(laborRate) + '/hour',
        total: formatCurrency(laborCost)
    });

    // Calculate totals
    const subtotal = materialCost + laborCost;
    const vat = subtotal * 0.15; // 15% VAT
    const total = subtotal + vat;

    return {
        breakdown: breakdownItems,
        subtotal: subtotal,
        vat: vat,
        total: total
    };
}

/* Extract numeric area value from dimensions string */
function extractAreaValue(dimensions) {
    // Simple extraction - looks for numbers in the string
    const match = dimensions.match(/(\d+(?:\.\d+)?)\s*(?:m2|sqm|square\s*meters?)/i);
    if (match) {
        return parseFloat(match[1]);
    }

    // If no explicit area, try to get first number
    const numMatch = dimensions.match(/(\d+(?:\.\d+)?)/);
    if (numMatch) {
        return parseFloat(numMatch[1]);
    }

    // Default fallback
    return 10; // Assume 10 m2 if nothing found
}

/* Format item name for display */
function formatItemName(item) {
    return item
        .split(/(?=[A-Z])/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
        .replace(/([A-Z]+)/g, match => match.toLowerCase())
        .replace(/\b\w/g, char => char.toUpperCase());
}

/* Display estimate breakdown in the UI */
function displayEstimateBreakdown(breakdown) {
    estimateDetails.innerHTML = '';

    breakdown.forEach(item => {
        const div = document.createElement('div');
        div.className = 'estimate-detail-item';
        div.innerHTML = `
            <span>${item.name}</span>
            <div>
                <span>${item.quantity} × ${item.unitPrice}</span>
                <span>${item.total}</span>
            </div>
        `;
        estimateDetails.appendChild(div);
    });
}

/* Format currency */
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-ZA', {
        style: 'currency',
        currency: 'ZAR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
}

/* Generate reference number */
function generateReferenceNumber() {
    const datePart = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const randomPart = Math.floor(Math.random() * 9000) + 1000; // 4-digit random
    return `ENQ-${datePart}-${randomPart}`;
}

/* Capitalize first letter */
function capitalizeFirstLetter(string) {
    if (!string) return '';
    return string.charAt(0).toUpperCase() + string.slice(1);
}

/* Show error message */
function showError(message) {
    alert(message); // Simple alert for now - could be enhanced
}

/* Submit as enquiry (uses EmailJS/CallMeBot) */
async function submitAsEnquiry() {
    // Get form values
    const serviceType = document.getElementById('service-type').value;
    const area = document.getElementById('area').value;
    const dimensions = document.getElementById('dimensions').value;
    const quality = document.getElementById('quality').value;
    const details = document.getElementById('details').value;
    const clientName = document.getElementById('q-client-name')?.value || "Not provided";
    const clientContact = document.getElementById('q-client-contact')?.value || "Not provided";

    // Validate
    if (!serviceType || !area || !dimensions) {
        showError('Please fill in all required fields');
        return;
    }

    // Show loading state
    submitEnquiryBtn.disabled = true;
    submitEnquiryBtn.textContent = 'Sending...';

    try {
        // Generate reference number
        const refNumber = generateReferenceNumber();

        // Prepare data for notifications
        const summary =
            `New enquiry ${refNumber}\n` +
            `Service: ${serviceType}\n` +
            `Area: ${area}\n` +
            `Client: ${clientName}\n` +
            `Contact: ${clientContact}\n` +
            `Details: ${details || "—"}\n` +
            `Dimensions: ${dimensions}\n` +
            `Quality: ${quality}`;

        // Send email via EmailJS
        if (window.emailjs) {
            try {
                await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
                    ref_number: refNumber,
                    service: serviceType,
                    area: area,
                    client_name: clientName,
                    client_contact: clientContact,
                    details: details || "—",
                    dimensions: dimensions,
                    quality: quality,
                    to_email: "buildright.solutions.agency@gmail.com"
                });
                console.log("Email notification sent.");
            } catch (emailErr) {
                console.error("Email send failed:", emailErr);
                // Continue with WhatsApp even if email fails
            }
        }

        // Send WhatsApp via CallMeBot
        try {
            const waUrl = `https://api.callmebot.com/whatsapp.php?phone=${CALLMEBOT_PHONE}` +
                          `&text=${encodeURIComponent(summary)}&apikey=${CALLMEBOT_APIKEY}`;
            await fetch(waUrl, { mode: "no-cors" });
            console.log("WhatsApp notification sent.");
        } catch (waErr) {
            console.error("WhatsApp send failed:", waErr);
        }

        // Save to localStorage as fallback
        const existing = JSON.parse(localStorage.getItem("brs_enquiries") || "[]");
        existing.push({
            ref: refNumber,
            service: serviceType,
            area: area,
            dimensions: dimensions,
            quality: quality,
            details: details,
            client_name: clientName,
            client_contact: clientContact,
            submittedAt: new Date().toISOString()
        });
        localStorage.setItem("brs_enquiries", JSON.stringify(existing));

        // Forward to BRS connector: real branded PDF + dashboard log (best-effort)
        sendToBrsConnector({
            source: "quotation-agent",
            ref: refNumber,
            service: serviceType,
            area: area,
            dimensions: dimensions,
            quality: quality,
            details: details || "",
            client_name: clientName,
            client_contact: clientContact,
            estimated_total: currentEstimateTotal()
        });

        // Show success
        submitEnquiryBtn.disabled = false;
        submitEnquiryBtn.textContent = 'Send as Enquiry';
        alert(`Thanks! Your enquiry has been sent. Reference: ${refNumber}`);

        // Reset form
        quotationForm.reset();
        estimateResults.classList.add('hidden');

    } catch (error) {
        console.error("Submission failed:", error);
        submitEnquiryBtn.disabled = false;
        submitEnquiryBtn.textContent = 'Send as Enquiry';
        alert('Sorry, there was an error sending your enquiry. Please try again.');
    }
}

/* Handle enquiry form submission */
function handleEnquirySubmit(e) {
    e.preventDefault();

    // Get form values
    const name = document.getElementById('enq-name').value.trim();
    const contact = document.getElementById('enq-contact').value.trim();
    const service = document.getElementById('enq-service').value;
    const area = document.getElementById('enq-area').value;
    const details = document.getElementById('enq-details').value.trim();

    // Basic validation
    if (!name || !contact || !service || !area || !details) {
        enquiryStatus.textContent = 'Please fill in all required fields';
        enquiryStatus.className = 'status-message error';
        enquiryStatus.classList.remove('hidden');
        return;
    }

    // Show loading state
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';

    // Process enquiry (similar to submitAsEnquiry but for enquiry form)
    processEnquiry({
        name,
        contact,
        service,
        area,
        details
    }, submitBtn);
}

/* Process enquiry (shared logic) */
async function processEnquiry(formData, submitBtn) {
    try {
        // Generate reference number
        const refNumber = generateReferenceNumber();

        // Prepare summary
        const summary =
            `New enquiry ${refNumber}\n` +
            `Service: ${formData.service}\n` +
            `Area: ${formData.area}\n` +
            `Client: ${formData.name}\n` +
            `Contact: ${formData.contact}\n` +
            `Details: ${formData.details || "—"}`;

        // Send email via EmailJS
        if (window.emailjs) {
            try {
                await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
                    ref_number: refNumber,
                    service: formData.service,
                    area: formData.area,
                    client_name: formData.name,
                    client_contact: formData.contact,
                    details: formData.details || "—",
                    to_email: "buildright.solutions.agency@gmail.com"
                });
                console.log("Email notification sent.");
            } catch (emailErr) {
                console.error("Email send failed:", emailErr);
            }
        }

        // Send WhatsApp via CallMeBot
        try {
            const waUrl = `https://api.callmebot.com/whatsapp.php?phone=${CALLMEBOT_PHONE}` +
                          `&text=${encodeURIComponent(summary)}&apikey=${CALLMEBOT_APIKEY}`;
            await fetch(waUrl, { mode: "no-cors" });
            console.log("WhatsApp notification sent.");
        } catch (waErr) {
            console.error("WhatsApp send failed:", waErr);
        }

        // Save to localStorage
        const existing = JSON.parse(localStorage.getItem("brs_enquiries") || "[]");
        existing.push({
            ref: refNumber,
            ...formData,
            submittedAt: new Date().toISOString()
        });
        localStorage.setItem("brs_enquiries", JSON.stringify(existing));

        // Forward to BRS connector: real branded PDF + dashboard log (best-effort)
        sendToBrsConnector({
            source: "new-enquiry",
            ref: refNumber,
            service: formData.service,
            area: formData.area,
            details: formData.details || "",
            client_name: formData.name,
            client_contact: formData.contact
        });

        // Reset form and show success
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Quote Request';
        enquiryForm.reset();

        enquiryStatus.textContent = `Thanks! Your enquiry has been sent. Reference: ${refNumber}`;
        enquiryStatus.className = 'status-message success';
        enquiryStatus.classList.remove('hidden');

        // Hide status after 5 seconds
        setTimeout(() => {
            enquiryStatus.classList.add('hidden');
        }, 5000);

    } catch (error) {
        console.error("Enquiry submission failed:", error);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Quote Request';
        enquiryStatus.textContent = 'Sorry, there was an error sending your enquiry. Please try again.';
        enquiryStatus.className = 'status-message error';
        enquiryStatus.classList.remove('hidden');

        // Hide status after 5 seconds
        setTimeout(() => {
            enquiryStatus.classList.add('hidden');
        }, 5000);
    }
}

/* Create professional quotation (placeholder - would integrate with backend) */
function createProfessionalQuotation() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        showError('PDF engine not loaded. Please refresh the page and try again.');
        return;
    }

    const serviceType = document.getElementById('service-type').value;
    const area = document.getElementById('area').value;
    const dimensions = document.getElementById('dimensions').value;
    const quality = document.getElementById('quality').value;
    const details = document.getElementById('details').value;

    if (!serviceType || !area || !dimensions) {
        showError('Please fill in all required fields before creating a quotation PDF');
        return;
    }

    const refNumber = estimateRef.textContent && estimateRef.textContent.startsWith('ENQ-')
        ? estimateRef.textContent
        : generateReferenceNumber();

    estimateRef.textContent = refNumber;

    const estimate = calculateEstimate(serviceType, dimensions, quality, details);
    displayEstimateBreakdown(estimate.breakdown);
    estimateSubtotal.textContent = formatCurrency(estimate.subtotal);
    estimateVat.textContent = formatCurrency(estimate.vat);
    estimateTotal.textContent = formatCurrency(estimate.total);
    estimateResults.classList.remove('hidden');

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 40;
    let y = 50;

    const ensureSpace = (spaceNeeded) => {
        if (y + spaceNeeded > pageHeight - margin) {
            pdf.addPage();
            y = 50;
        }
    };

    const addText = (text, x, size = 11, style = 'normal') => {
        pdf.setFont('helvetica', style);
        pdf.setFontSize(size);
        pdf.text(text, x, y);
    };

    const addWrappedText = (text, x, maxWidth, lineHeight = 14, size = 10, style = 'normal') => {
        pdf.setFont('helvetica', style);
        pdf.setFontSize(size);
        const lines = pdf.splitTextToSize(text, maxWidth);
        ensureSpace(lines.length * lineHeight + 4);
        lines.forEach((line) => {
            pdf.text(line, x, y);
            y += lineHeight;
        });
    };

    addText('BUILD RIGHT SOLUTIONS', margin, 18, 'bold');
    y += 20;
    addText('Professional Quotation', margin, 13, 'bold');
    y += 18;
    addText(`Reference: ${refNumber}`, margin, 10);
    addText(`Date: ${new Date().toLocaleDateString('en-ZA')}`, pageWidth - 170, 10);
    y += 18;

    pdf.setDrawColor(180);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 18;

    addText(`Service: ${capitalizeFirstLetter(serviceType)}`, margin, 11);
    y += 16;
    addText(`Area/Location: ${area}`, margin, 11);
    y += 16;
    addWrappedText(`Dimensions/Size: ${dimensions}`, margin, pageWidth - margin * 2, 14, 11);
    addText(`Quality: ${capitalizeFirstLetter(quality)}`, margin, 11);
    y += 18;

    if (details && details.trim()) {
        addText('Additional Details:', margin, 11, 'bold');
        y += 14;
        addWrappedText(details.trim(), margin, pageWidth - margin * 2, 14, 10);
        y += 4;
    }

    addText('Estimate Breakdown', margin, 12, 'bold');
    y += 16;

    estimate.breakdown.forEach((item) => {
        ensureSpace(30);
        addWrappedText(`${item.name} (${item.quantity} @ ${item.unitPrice})`, margin, pageWidth - 200, 13, 10);
        y -= 13;
        addText(item.total, pageWidth - margin - 80, 10, 'bold');
        y += 17;
    });

    y += 8;
    pdf.line(margin, y, pageWidth - margin, y);
    y += 18;

    addText(`Subtotal: ${formatCurrency(estimate.subtotal)}`, pageWidth - 230, 11);
    y += 16;
    addText(`VAT (15%): ${formatCurrency(estimate.vat)}`, pageWidth - 230, 11);
    y += 16;
    addText(`Total: ${formatCurrency(estimate.total)}`, pageWidth - 230, 13, 'bold');
    y += 22;

    addWrappedText(
        'This quotation is an estimate based on information provided and is subject to final site inspection and material confirmation.',
        margin,
        pageWidth - margin * 2,
        13,
        9,
        'italic'
    );

    pdf.save(`Quotation_${refNumber}.pdf`);
}

/* Load templates (example data) */
function loadTemplates() {
    // Example templates - in reality these would come from your BRS examples.py or a database
    const templates = [
        {
            id: 1,
            title: "Bathroom Tiling",
            service: "Tiling",
            area: "Johannesburg",
            description: "Complete bathroom tiling with waterproofing",
            image: "https://via.placeholder.com/300x200"
        },
        {
            id: 2,
            title: "Living Room Painting",
            service: "Painting",
            area: "Randburg",
            description: "Interior painting of living room and hallway",
            image: "https://via.placeholder.com/300x200"
        },
        {
            id: 3,
            title: "Kitchen Plumbing",
            service: "Plumbing",
            area: "Sandton",
            description: "New kitchen plumbing installation",
            image: "https://via.placeholder.com/300x200"
        },
        {
            id: 4,
            title: "Bedroom Carpentry",
            service: "Carpentry",
            area: "Rosebank",
            description: "Built-in wardrobes and shelving",
            image: "https://via.placeholder.com/300x200"
        },
        {
            id: 5,
            title: "Driveway Paving",
            service: "Paving",
            area: "Pretoria",
            description: "Interlocking paver driveway installation",
            image: "https://via.placeholder.com/300x200"
        },
        {
            id: 6,
            title: "Roof Waterproofing",
            service: "Waterproofing",
            area: "Midrand",
            description: "Roof waterproofing and drainage improvement",
            image: "https://via.placeholder.com/300x200"
        }
    ];

    // Clear and populate grid
    templatesGrid.innerHTML = '';

    templates.forEach(template => {
        const card = document.createElement('div');
        card.className = 'template-card';
        card.innerHTML = `
            <div class="template-header">
                <h3>${template.title}</h3>
                <p>${template.service} • ${template.area}</p>
            </div>
            <div class="template-body">
                <img src="${template.image}" alt="${template.title}" class="template-image">
                <p class="template-description">${template.description}</p>
                <div class="template-actions">
                    <button class="btn btn-primary" onclick="useTemplate(${template.id})">Use This Template</button>
                    <button class="btn btn-outline" onclick="viewTemplateDetails(${template.id})">View Details</button>
                </div>
            </div>
        `;
        templatesGrid.appendChild(card);
    });
}

/* Use template (populate quotation form) */
function useTemplate(templateId) {
    // Switch to quotation tab
    document.querySelector('.tab-btn[data-tab="quotation"]').click();

    // In a real implementation, this would populate the form with template data
    alert('Template loaded! In a full implementation, this would populate the form with the selected template data.');

    // For demo, just show a message
    const quotationForm = document.getElementById('quotation-form');
    quotationForm.reset();

    // Set some default values based on template
    if (templateId === 1) {
        document.getElementById('service-type').value = 'tiling';
        document.getElementById('area').value = 'Johannesburg';
        document.getElementById('dimensions').value = '5m2 bathroom';
        document.getElementById('quality').value = 'standard';
    }
    // ... other templates
}

/* View template details */
function viewTemplateDetails(templateId) {
    alert(`Viewing details for template ${templateId}\nIn a full implementation, this would show a modal with more information about this template.`);
}

/* Initialize page */
document.addEventListener('DOMContentLoaded', () => {
    // Load templates
    loadTemplates();

    // Add year to footer
    const yearElement = document.querySelector('.footer-bottom');
    if (yearElement) {
        const currentYear = new Date().getFullYear();
        yearElement.innerHTML = yearElement.innerHTML.replace('2026', currentYear);
    }

    // Check if we're on a mobile device and adjust accordingly
    if (window.innerWidth < 768) {
        // Mobile-specific adjustments could go here
    }
});
