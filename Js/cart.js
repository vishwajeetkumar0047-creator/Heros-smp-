/* =====================================
   CART PAGE JS
   Cart ke items dikhata hai, quantity badalne / hatane deta hai,
   phir checkout par bhejta hai.
===================================== */

document.addEventListener("DOMContentLoaded", async function () {

    const container = document.getElementById("cartBody");

    if (!container || !window.spark || !window.sparkCart) return;

    const spark = window.spark;
    const cart = window.sparkCart;


    function make(tag, className, text) {

        const element = document.createElement(tag);

        if (className) element.className = className;

        if (text !== undefined && text !== null) element.textContent = text;

        return element;

    }

    function money(value) {

        const number = Number(value);

        return spark.config.currency + (Number.isInteger(number) ? String(number) : number.toFixed(2));

    }

    function showMessage(text, linkText, href) {

        container.textContent = "";

        const box = make("div", "cart-empty");

        box.appendChild(make("p", "", text));

        if (href) {

            const anchor = make("a", "apply-link-btn", linkText);

            anchor.href = href;

            box.appendChild(anchor);

        }

        container.appendChild(box);

    }


    let products = {};   /* id -> item */

    async function loadProducts(lines) {

        const ids = lines.map(function (line) { return line.id; }).filter(function (id) {
            return /^[0-9a-fA-F-]{36}$/.test(id);
        });

        if (ids.length === 0) return {};

        const rows = await spark.select(
            "store_items",
            "select=id,name,price,image_url,category&id=in.(" + ids.join(",") + ")"
        );

        const map = {};

        rows.forEach(function (row) { map[row.id] = row; });

        return map;

    }


    function render() {

        const lines = cart.get();

        if (lines.length === 0) {

            showMessage("Your cart is empty.", "Go to Store", "store.html");

            return;

        }

        container.textContent = "";

        const list = make("div", "cart-list");

        let subtotal = 0;

        lines.forEach(function (line) {

            const item = products[line.id];

            const row = make("div", "cart-row");

            const thumb = make("div", "co-thumb");

            if (item && item.image_url) {

                const image = make("img");
                image.alt = item.name;
                image.addEventListener("error", function () {
                    thumb.textContent = "";
                    thumb.appendChild(make("i", "fa-solid fa-bag-shopping"));
                });
                image.src = item.image_url;

                thumb.appendChild(image);

            } else {

                thumb.appendChild(make("i", "fa-solid fa-bag-shopping"));

            }

            row.appendChild(thumb);

            const info = make("div", "cart-info");

            info.appendChild(make("div", "co-item-name", item.name));
            info.appendChild(make("div", "co-item-price", money(item.price) + " each"));

            const controls = make("div", "cart-controls");

            const qtyBox = make("div", "co-qty");

            const minus = make("button", "", "−");
            minus.type = "button";
            minus.setAttribute("aria-label", "Decrease quantity");

            const qtyInput = make("input");
            qtyInput.type = "number";
            qtyInput.min = "1";
            qtyInput.max = "99";
            qtyInput.value = String(line.qty);
            qtyInput.inputMode = "numeric";
            qtyInput.setAttribute("aria-label", "Quantity");

            const plus = make("button", "", "+");
            plus.type = "button";
            plus.setAttribute("aria-label", "Increase quantity");

            minus.addEventListener("click", function () { cart.set(line.id, line.qty - 1); render(); });
            plus.addEventListener("click", function () { cart.set(line.id, line.qty + 1); render(); });
            qtyInput.addEventListener("change", function () { cart.set(line.id, qtyInput.value); render(); });

            qtyBox.appendChild(minus);
            qtyBox.appendChild(qtyInput);
            qtyBox.appendChild(plus);

            const remove = make("button", "cart-remove", "Remove");
            remove.type = "button";
            remove.addEventListener("click", function () { cart.remove(line.id); render(); });

            controls.appendChild(qtyBox);
            controls.appendChild(remove);

            info.appendChild(controls);

            row.appendChild(info);

            const lineTotal = Number(item.price) * line.qty;

            subtotal += lineTotal;

            row.appendChild(make("div", "cart-line-total", money(lineTotal)));

            list.appendChild(row);

        });

        container.appendChild(list);

        const summary = make("div", "cart-summary");

        const totalRow = make("div", "cart-subtotal");

        totalRow.appendChild(make("span", "", "Subtotal"));
        totalRow.appendChild(make("strong", "", money(subtotal)));

        summary.appendChild(totalRow);

        summary.appendChild(make(
            "p",
            "co-note",
            "Coupon codes can be applied at checkout. The final price is confirmed there."
        ));

        const actions = make("div", "apply-links");

        const checkout = make("a", "apply-link-btn", "Proceed to checkout");
        checkout.href = "checkout.html";

        const more = make("a", "apply-link-btn secondary", "Continue shopping");
        more.href = "store.html";

        actions.appendChild(checkout);
        actions.appendChild(more);

        summary.appendChild(actions);

        const clear = make("button", "cart-clear", "Clear cart");
        clear.type = "button";
        clear.addEventListener("click", function () {

            if (window.confirm("Remove all items from your cart?")) {
                cart.clear();
                render();
            }

        });

        summary.appendChild(clear);

        container.appendChild(summary);

    }


    container.appendChild(make("p", "orders-status", "Loading cart..."));

    const lines = cart.get();

    if (lines.length === 0) {
        render();
        return;
    }

    try {

        products = await loadProducts(lines);

    } catch (error) {

        showMessage("Could not load your cart. Please try again later.", "Back to Store", "store.html");

        return;

    }

    /* jo items ab available nahi hain unhe cart se hata do */

    let removed = 0;

    lines.forEach(function (line) {

        if (!products[line.id]) {
            cart.remove(line.id);
            removed++;
        }

    });

    render();

    if (removed > 0) {

        const note = make(
            "p",
            "co-note",
            removed + (removed === 1 ? " item was" : " items were") + " removed because it is no longer available."
        );

        container.insertBefore(note, container.firstChild);

    }

});
