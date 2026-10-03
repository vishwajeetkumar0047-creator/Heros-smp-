/* =====================================
   CHECKOUT PAGE JS
   checkout.html            -> cart ke saare items
   checkout.html?item=ID    -> "Buy now" (ek item)
   1) Items + coupon + total (price database se aata hai)
   2) UPI / QR se payment (details admin panel se set hoti hain)
   3) Payment screenshot + UTR submit -> admin approve karta hai
===================================== */

document.addEventListener("DOMContentLoaded", async function () {

    const body = document.getElementById("checkoutBody");
    const titleEl = document.getElementById("checkoutTitle");
    const subEl = document.getElementById("checkoutSub");

    if (!body || !window.spark) return;

    const spark = window.spark;
    const client = spark.client;
    const cart = window.sparkCart;
    const currency = spark.config.currency;

    const PROOF_BUCKET = "payment-proofs";
    const MAX_ORIGINAL_SIZE = 25 * 1024 * 1024;
    const MAX_IMAGE_SIDE = 1600;

    const extensions = {
        "image/webp": "webp",
        "image/png": "png",
        "image/jpeg": "jpg"
    };


    /* =========================
       HELPERS
    ========================= */

    function make(tag, className, text) {

        const element = document.createElement(tag);

        if (className) element.className = className;

        if (text !== undefined && text !== null) element.textContent = text;

        return element;

    }

    function link(text, href, secondary) {

        const anchor = make("a", "apply-link-btn" + (secondary ? " secondary" : ""), text);

        anchor.href = href;

        return anchor;

    }

    function showGate(message, links) {

        body.textContent = "";

        const gate = make("div", "apply-gate");

        gate.appendChild(make("p", "", message));

        if (links && links.length) {

            const row = make("div", "apply-links");

            links.forEach(function (item) { row.appendChild(item); });

            gate.appendChild(row);

        }

        body.appendChild(gate);

    }

    function money(value) {

        const number = Number(value);

        return currency + (Number.isInteger(number) ? String(number) : number.toFixed(2));

    }

    function copyText(text, button) {

        function done() {

            const old = button.textContent;

            button.textContent = "Copied!";

            setTimeout(function () { button.textContent = old; }, 1500);

        }

        function fallback() {

            const area = document.createElement("textarea");

            area.value = text;
            area.style.position = "fixed";
            area.style.opacity = "0";

            document.body.appendChild(area);

            area.select();

            try { document.execCommand("copy"); done(); } catch (error) {}

            area.remove();

        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done, fallback);
        } else {
            fallback();
        }

    }

    /* Badi screenshot ko chhota karke upload karna (UTR padhne layak quality rehti hai) */

    function loadImage(file) {

        return new Promise(function (resolve, reject) {

            const url = URL.createObjectURL(file);
            const image = new Image();

            image.onload = function () { URL.revokeObjectURL(url); resolve(image); };

            image.onerror = function () {
                URL.revokeObjectURL(url);
                reject(new Error("Could not read this image. Try a PNG or JPG screenshot."));
            };

            image.src = url;

        });

    }

    async function prepareImage(file) {

        const image = await loadImage(file);

        const longSide = Math.max(image.naturalWidth, image.naturalHeight);
        const scale = Math.min(1, MAX_IMAGE_SIDE / longSide);

        const canvas = document.createElement("canvas");

        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);

        const blob = await new Promise(function (resolve) {
            canvas.toBlob(resolve, "image/webp", 0.88);
        });

        if (blob && (scale < 1 || blob.size < file.size)) return blob;

        return file;

    }

    function rpcMessage(error, fallback) {

        if (error && error.code === "P0001" && error.message) return error.message;

        return fallback;

    }


    /* =========================
       KYA KHARIDNA HAI (cart ya Buy now)
    ========================= */

    const itemParam = new URLSearchParams(window.location.search).get("item");

    const singleMode = !!itemParam;

    let items = [];   /* [{ id, qty }] */

    if (singleMode) {

        if (!/^[0-9a-fA-F-]{36}$/.test(itemParam)) {

            titleEl.textContent = "Item not found";

            showGate("No item selected.", [link("Go to Store", "store.html")]);

            return;

        }

        items = [{ id: itemParam, qty: 1 }];

    } else {

        items = cart ? cart.get() : [];

        if (items.length === 0) {

            titleEl.textContent = "Your cart is empty";

            showGate("Add something to your cart first.", [link("Go to Store", "store.html")]);

            return;

        }

    }


    /* =========================
       PAYMENT SETTINGS + LOGIN
    ========================= */

    let settings = {};

    try {

        const rows = await spark.select(
            "site_settings",
            "select=key,value&key=in.(payment_upi_id,payment_qr_url,payment_note)"
        );

        rows.forEach(function (row) { settings[row.key] = row.value || ""; });

    } catch (error) {

        titleEl.textContent = "Something went wrong";

        showGate("Could not load checkout. Please try again later.", [link("Back to Store", "store.html")]);

        return;

    }

    titleEl.textContent = "Complete your order";
    subEl.textContent = "Pay using UPI, then submit your payment screenshot and UTR. We will approve it after checking.";

    const session = client ? await client.auth.getSession() : null;

    if (!session || !session.data || !session.data.session) {

        const next = encodeURIComponent("checkout.html" + (singleMode ? "?item=" + itemParam : ""));

        showGate(
            "You need to be logged in to place an order.",
            [
                link("Login", "login.html?next=" + next),
                link("Create account", "signup.html", true)
            ]
        );

        return;

    }

    const userId = session.data.session.user.id;

    let profileName = "";

    try {

        const profile = await client
            .from("profiles")
            .select("username")
            .eq("id", userId)
            .maybeSingle();

        if (profile.data && profile.data.username) profileName = profile.data.username;

    } catch (error) {}


    /* =========================
       ORDER PREVIEW (database se asli price + coupon)
    ========================= */

    let couponCode = "";     /* jo abhi lagaya hua hai */
    let preview = null;      /* preview_order ka result */

    function itemsPayload() {

        return items.map(function (line) { return { id: line.id, qty: line.qty }; });

    }

    async function fetchPreview(coupon) {

        const result = await client.rpc("preview_order", {
            p_items: itemsPayload(),
            p_coupon: coupon || null
        });

        return result;

    }

    let first = await fetchPreview("");

    if (first.error) {

        titleEl.textContent = "Cannot checkout";

        showGate(
            rpcMessage(first.error, "Could not load your order. Please try again."),
            [link(singleMode ? "Back to Store" : "Back to Cart", singleMode ? "store.html" : "cart.html")]
        );

        return;

    }

    preview = first.data;

    /* thumbnails ke liye images */

    const images = {};

    try {

        const ids = items.map(function (line) { return line.id; }).join(",");

        const rows = await spark.select("store_items", "select=id,image_url&id=in.(" + ids + ")");

        rows.forEach(function (row) { images[row.id] = row.image_url; });

    } catch (error) {}


    /* =========================
       PAYMENT DETAILS
    ========================= */

    const upiId = (settings.payment_upi_id || "").trim();
    const qrUrl = (settings.payment_qr_url || "").trim();
    const payNote = (settings.payment_note || "").trim();
    const paymentReady = upiId !== "" || qrUrl !== "";

    const payAmountEls = [];
    let upiAppLink = null;


    /* =========================
       BUILD PAGE
    ========================= */

    body.textContent = "";


    /* ---- 1) order summary ---- */

    const summary = make("div", "co-block");

    summary.appendChild(make("h3", "", "Your order"));

    const linesBox = make("div", "co-lines");

    summary.appendChild(linesBox);

    /* coupon */

    const couponBox = make("div", "co-coupon");

    const couponRow = make("div", "co-coupon-row");

    const couponInput = make("input", "apply-control");
    couponInput.type = "text";
    couponInput.placeholder = "Coupon code";
    couponInput.maxLength = 20;
    couponInput.autocomplete = "off";
    couponInput.setAttribute("autocapitalize", "characters");
    couponInput.setAttribute("aria-label", "Coupon code");

    const couponBtn = make("button", "co-small-btn", "Apply");
    couponBtn.type = "button";

    couponRow.appendChild(couponInput);
    couponRow.appendChild(couponBtn);

    const couponMsg = make("div", "co-coupon-msg");

    couponBox.appendChild(couponRow);
    couponBox.appendChild(couponMsg);

    summary.appendChild(couponBox);

    /* totals */

    const totals = make("div", "co-totals");

    summary.appendChild(totals);

    body.appendChild(summary);


    let busy = false;

    function setBusy(value) {

        busy = value;

        couponBtn.disabled = value;

    }

    function renderLines() {

        linesBox.textContent = "";

        preview.lines.forEach(function (line) {

            const row = make("div", "co-line");

            const thumb = make("div", "co-thumb small");

            if (images[line.item_id]) {

                const image = make("img");

                image.alt = line.item_name;

                image.addEventListener("error", function () {
                    thumb.textContent = "";
                    thumb.appendChild(make("i", "fa-solid fa-bag-shopping"));
                });

                image.src = images[line.item_id];

                thumb.appendChild(image);

            } else {

                thumb.appendChild(make("i", "fa-solid fa-bag-shopping"));

            }

            row.appendChild(thumb);

            const text = make("div", "co-line-text");

            text.appendChild(make("div", "co-item-name", line.item_name));
            text.appendChild(make("div", "co-item-price", money(line.unit_price) + " each"));

            row.appendChild(text);

            if (singleMode) {

                /* Buy now: quantity yahin badal sakte hain */

                const qtyBox = make("div", "co-qty");

                const minus = make("button", "", "−");
                minus.type = "button";
                minus.setAttribute("aria-label", "Decrease quantity");

                const qtyInput = make("input");
                qtyInput.type = "number";
                qtyInput.min = "1";
                qtyInput.max = "99";
                qtyInput.value = String(line.quantity);
                qtyInput.inputMode = "numeric";
                qtyInput.setAttribute("aria-label", "Quantity");

                const plus = make("button", "", "+");
                plus.type = "button";
                plus.setAttribute("aria-label", "Increase quantity");

                function change(value) {

                    let number = parseInt(value, 10);

                    if (!Number.isFinite(number) || number < 1) number = 1;
                    if (number > 99) number = 99;

                    items[0].qty = number;

                    refresh();

                }

                minus.addEventListener("click", function () { change(line.quantity - 1); });
                plus.addEventListener("click", function () { change(line.quantity + 1); });
                qtyInput.addEventListener("change", function () { change(qtyInput.value); });

                qtyBox.appendChild(minus);
                qtyBox.appendChild(qtyInput);
                qtyBox.appendChild(plus);

                row.appendChild(qtyBox);

            } else {

                row.appendChild(make("div", "co-line-qty", "× " + line.quantity));

            }

            row.appendChild(make("div", "co-line-total", money(line.line_total)));

            linesBox.appendChild(row);

        });

        if (!singleMode) {

            const edit = make("a", "co-edit-cart", "Edit cart");

            edit.href = "cart.html";

            linesBox.appendChild(edit);

        }

    }

    function renderTotals() {

        totals.textContent = "";

        function addRow(label, value, className) {

            const row = make("div", "co-total-row" + (className ? " " + className : ""));

            row.appendChild(make("span", "", label));
            row.appendChild(make("strong", "", value));

            totals.appendChild(row);

        }

        addRow("Subtotal", money(preview.subtotal));

        if (Number(preview.discount) > 0) {

            addRow(
                "Discount" + (preview.coupon_code ? " (" + preview.coupon_code + ")" : ""),
                "−" + money(preview.discount),
                "discount"
            );

        }

        addRow("Total to pay", money(preview.total), "grand");

    }

    function renderCoupon(message, isError) {

        couponMsg.textContent = "";

        couponMsg.className = "co-coupon-msg" + (isError ? " error" : message ? " ok" : "");

        if (!message) return;

        couponMsg.appendChild(document.createTextNode(message));

        if (!isError && couponCode) {

            const remove = make("button", "co-coupon-remove", "Remove");

            remove.type = "button";

            remove.addEventListener("click", function () {

                couponCode = "";
                couponInput.value = "";
                couponInput.disabled = false;
                couponBtn.hidden = false;

                refresh();

            });

            couponMsg.appendChild(remove);

        }

    }

    function updatePayAmounts() {

        payAmountEls.forEach(function (element) { element.textContent = money(preview.total); });

        if (upiAppLink) {

            upiAppLink.href = "upi://pay?pa=" + encodeURIComponent(upiId) +
                "&pn=" + encodeURIComponent("HEROS SMP") +
                "&am=" + Number(preview.total).toFixed(2) +
                "&cu=INR&tn=" + encodeURIComponent("HEROS SMP order");

        }

    }

    function renderAll() {

        renderLines();
        renderTotals();
        updatePayAmounts();

    }

    /* preview dobara laao (quantity / coupon badalne par) */

    async function refresh(newCoupon) {

        if (busy) return;

        setBusy(true);

        const wanted = newCoupon !== undefined ? newCoupon : couponCode;

        let result = await fetchPreview(wanted);

        if (result.error && wanted) {

            /* coupon galat / expire - message dikhao, coupon ke bina total wapas laao */

            renderCoupon(rpcMessage(result.error, "Could not apply this coupon."), true);

            couponCode = "";

            result = await fetchPreview("");

        } else if (!result.error) {

            couponCode = result.data.coupon_code || "";

            if (couponCode) {

                couponInput.value = couponCode;
                couponInput.disabled = true;
                couponBtn.hidden = true;

                renderCoupon(
                    "Coupon " + couponCode + " applied: you save " + money(result.data.discount) + ".",
                    false
                );

            } else if (newCoupon === undefined) {

                renderCoupon("", false);

            }

        }

        if (result.error) {

            renderCoupon(rpcMessage(result.error, "Could not update your order."), true);

        } else {

            preview = result.data;

            renderAll();

        }

        setBusy(false);

    }

    couponBtn.addEventListener("click", function () {

        const code = couponInput.value.trim().toUpperCase();

        if (!code) {

            renderCoupon("Enter a coupon code first.", true);

            return;

        }

        refresh(code);

    });

    couponInput.addEventListener("keydown", function (event) {

        if (event.key === "Enter") {
            event.preventDefault();
            couponBtn.click();
        }

    });


    /* ---- 2) payment details ---- */

    const pay = make("div", "co-block");

    pay.appendChild(make("h3", "", "Step 1: Make the payment"));

    if (!paymentReady) {

        pay.appendChild(make(
            "div",
            "co-warning",
            "Payment details are not set up yet. Please contact the server team on Discord."
        ));

    } else {

        const payRow = make("div", "co-pay");

        if (qrUrl) {

            const qr = make("img", "co-qr");

            qr.alt = "Payment QR code";

            qr.src = qrUrl;

            payRow.appendChild(qr);

        }

        const info = make("div", "co-pay-info");

        const amount = make("div", "co-amount", "Pay exactly ");

        const amountValue = make("strong", "", money(preview.total));

        payAmountEls.push(amountValue);

        amount.appendChild(amountValue);

        info.appendChild(amount);

        if (upiId) {

            const upiRow = make("div", "co-upi");

            upiRow.appendChild(make("span", "", upiId));

            const copyBtn = make("button", "co-small-btn", "Copy");
            copyBtn.type = "button";
            copyBtn.addEventListener("click", function () { copyText(upiId, copyBtn); });

            upiRow.appendChild(copyBtn);

            info.appendChild(upiRow);

            upiAppLink = make("a", "co-upi-app show", "Open UPI app");

            info.appendChild(upiAppLink);

        }

        if (payNote) info.appendChild(make("div", "co-note", payNote));

        payRow.appendChild(info);

        pay.appendChild(payRow);

    }

    body.appendChild(pay);

    renderAll();


    if (!paymentReady) return;


    /* ---- 3) proof form ---- */

    const proof = make("div", "co-block");

    proof.appendChild(make("h3", "", "Step 2: Submit payment proof"));

    const formEl = make("form");

    formEl.noValidate = true;

    function addField(labelText, inputEl, helpText) {

        const field = make("div", "field");

        const label = make("label", "", labelText);

        label.appendChild(make("span", "apply-required", " *"));

        if (inputEl.id) label.htmlFor = inputEl.id;

        field.appendChild(label);
        field.appendChild(inputEl);

        if (helpText) field.appendChild(make("small", "apply-note", helpText));

        field.appendChild(make("small", "field-error"));

        formEl.appendChild(field);

        return field;

    }

    function setError(field, message) {

        field.classList.toggle("invalid", message !== "");

        field.querySelector(".field-error").textContent = message;

    }

    const nameInput = make("input", "apply-control");
    nameInput.id = "co_name";
    nameInput.type = "text";
    nameInput.maxLength = 32;
    nameInput.value = profileName;
    nameInput.placeholder = "Your in-game name";
    nameInput.autocomplete = "off";

    const nameField = addField("Minecraft username", nameInput, "Your items will be delivered to this name.");

    const utrInput = make("input", "apply-control");
    utrInput.id = "co_utr";
    utrInput.type = "text";
    utrInput.maxLength = 30;
    utrInput.placeholder = "e.g. 412345678901";
    utrInput.autocomplete = "off";
    utrInput.setAttribute("autocapitalize", "characters");

    const utrField = addField("UTR / Transaction ID", utrInput, "Find it in your payment app under transaction details.");

    /* screenshot */

    const fileField = make("div", "field");

    const fileLabel = make("label", "", "Payment screenshot");

    fileLabel.appendChild(make("span", "apply-required", " *"));

    fileField.appendChild(fileLabel);

    const fileRow = make("div", "co-file");

    const filePreview = make("div", "co-file-preview");

    filePreview.appendChild(make("i", "fa-solid fa-image"));

    const fileInput = make("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.hidden = true;

    const fileBtn = make("button", "co-file-btn", "Choose from gallery");
    fileBtn.type = "button";

    const fileName = make("div", "co-file-name");

    let chosenFile = null;
    let previewUrl = null;

    fileBtn.addEventListener("click", function () { fileInput.click(); });

    fileInput.addEventListener("change", function () {

        const file = fileInput.files && fileInput.files[0];

        if (!file) return;

        setError(fileField, "");

        if (!file.type.startsWith("image/")) {
            setError(fileField, "Please choose an image (screenshot).");
            return;
        }

        if (file.size > MAX_ORIGINAL_SIZE) {
            setError(fileField, "This image is too large. Choose one under 25 MB.");
            return;
        }

        chosenFile = file;

        if (previewUrl) URL.revokeObjectURL(previewUrl);

        previewUrl = URL.createObjectURL(file);

        filePreview.textContent = "";

        const image = make("img");

        image.alt = "Screenshot preview";
        image.src = previewUrl;

        filePreview.appendChild(image);

        fileName.textContent = file.name;

        fileBtn.textContent = "Change screenshot";

    });

    fileRow.appendChild(filePreview);
    fileRow.appendChild(fileBtn);
    fileRow.appendChild(fileInput);
    fileRow.appendChild(fileName);

    fileField.appendChild(fileRow);
    fileField.appendChild(make("small", "field-error"));

    formEl.appendChild(fileField);

    [nameInput, utrInput].forEach(function (input) {

        input.addEventListener("input", function () {
            setError(input.closest(".field"), "");
        });

    });

    const submitBtn = make("button", "auth-btn", "Submit payment proof");
    submitBtn.type = "submit";

    formEl.appendChild(submitBtn);

    const status = make("p", "auth-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    formEl.appendChild(status);

    proof.appendChild(formEl);

    body.appendChild(proof);


    /* =========================
       SUBMIT
    ========================= */

    function showStatus(type, message) {

        status.className = "auth-status " + type;

        status.textContent = message;

    }

    function showSuccess(orderId) {

        if (!singleMode && cart) cart.clear();

        titleEl.textContent = "Order submitted!";
        subEl.textContent = "";

        body.textContent = "";

        const done = make("div", "co-success");

        const check = make("div", "co-check");
        check.appendChild(make("i", "fa-solid fa-check"));

        done.appendChild(check);

        done.appendChild(make(
            "p",
            "",
            "We received your payment proof" +
            (orderId ? " (order " + String(orderId).slice(0, 8) + ")" : "") + ". " +
            "Our team will check it and approve your order soon. " +
            "You can see the status anytime in My Orders."
        ));

        const row = make("div", "apply-links");

        row.appendChild(link("My Orders", "orders.html"));
        row.appendChild(link("Back to Store", "store.html", true));

        done.appendChild(row);

        body.appendChild(done);

        window.scrollTo({ top: 0, behavior: "smooth" });

    }

    formEl.addEventListener("submit", async function (event) {

        event.preventDefault();

        status.className = "auth-status";
        status.textContent = "";

        if (busy) return;

        const username = nameInput.value.trim();
        const utr = utrInput.value.replace(/\s+/g, "").toUpperCase();

        let valid = true;

        if (username.length < 2 || username.length > 32) {
            setError(nameField, "Enter your Minecraft username (2-32 characters)");
            valid = false;
        }

        if (!/^[A-Z0-9]{8,30}$/.test(utr)) {
            setError(utrField, "Enter a valid UTR (8-30 letters or numbers, no spaces)");
            valid = false;
        }

        if (!chosenFile) {
            setError(fileField, "Please upload your payment screenshot");
            valid = false;
        }

        if (!valid) {

            const firstBad = formEl.querySelector(".field.invalid");

            if (firstBad) firstBad.scrollIntoView({ behavior: "smooth", block: "center" });

            return;

        }

        submitBtn.disabled = true;
        submitBtn.textContent = "Uploading...";

        setBusy(true);

        try {

            const blob = await prepareImage(chosenFile);

            const extension = extensions[blob.type];

            if (!extension) {
                throw new Error("Please use a PNG, JPG or WEBP screenshot.");
            }

            const path = userId + "/" + Date.now() + "-" +
                Math.random().toString(36).slice(2, 8) + "." + extension;

            const upload = await client.storage.from(PROOF_BUCKET).upload(path, blob, {
                contentType: blob.type,
                upsert: false
            });

            if (upload.error) {
                throw new Error("Could not upload the screenshot. Please try again.");
            }

            submitBtn.textContent = "Submitting...";

            const result = await client.rpc("place_order", {
                p_items: itemsPayload(),
                p_coupon: couponCode || null,
                p_minecraft_username: username,
                p_utr: utr,
                p_screenshot_path: path
            });

            if (result.error) {

                if (result.error.code === "23505") {
                    throw new Error("This UTR has already been submitted.");
                }

                throw new Error(rpcMessage(result.error, "Could not place the order. Please try again."));

            }

            showSuccess(result.data);

        } catch (error) {

            setBusy(false);

            submitBtn.disabled = false;
            submitBtn.textContent = "Submit payment proof";

            showStatus("error", error.message || "Something went wrong. Please try again.");

        }

    });

});
