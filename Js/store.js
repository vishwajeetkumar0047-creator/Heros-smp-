/* =====================================
   STORE PAGE JS
   - store_items Supabase se aate hain
   - Product par tap karne se preview (image gallery) khulta hai
   - Preview se "Buy now" -> checkout.html
===================================== */

document.addEventListener("DOMContentLoaded", function () {

    const container = document.getElementById("storeList");

    if (!container) return;


    function make(tag, className, text) {

        const element = document.createElement(tag);

        if (className) element.className = className;

        if (text !== undefined && text !== null) element.textContent = text;

        return element;

    }

    function showMessage(text) {

        container.textContent = "";

        container.appendChild(make("p", "data-status", text));

    }

    function formatPrice(value) {

        const number = Number(value);

        const text = Number.isInteger(number)
            ? String(number)
            : number.toFixed(2);

        return window.spark.config.currency + text;

    }

    function placeholderIcon() {

        return make("i", "fa-solid fa-bag-shopping");

    }

    /* cover image pehle, phir gallery ki images (order ke hisaab se) */

    function collectImages(item) {

        const urls = [];

        if (item.image_url) urls.push(item.image_url);

        (item.store_item_images || [])
            .slice()
            .sort(function (a, b) { return a.sort_order - b.sort_order; })
            .forEach(function (image) {

                if (image.image_url && urls.indexOf(image.image_url) === -1) {
                    urls.push(image.image_url);
                }

            });

        return urls;

    }


    /* =========================
       PREVIEW (modal + gallery)
    ========================= */

    let overlay = null;
    let lastFocus = null;
    let keyHandler = null;

    function closePreview() {

        if (!overlay) return;

        overlay.remove();
        overlay = null;

        document.body.style.overflow = "";

        document.removeEventListener("keydown", keyHandler);

        if (lastFocus && lastFocus.focus) lastFocus.focus();

    }

    function openPreview(item, trigger) {

        closePreview();

        lastFocus = trigger;

        const images = collectImages(item);

        let current = 0;

        overlay = make("div", "preview-overlay");
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.setAttribute("aria-label", item.name);

        const dialog = make("div", "preview-dialog");

        const closeBtn = make("button", "preview-close");
        closeBtn.type = "button";
        closeBtn.setAttribute("aria-label", "Close preview");
        closeBtn.appendChild(make("i", "fa-solid fa-xmark"));
        closeBtn.addEventListener("click", closePreview);


        /* ---- gallery ---- */

        const gallery = make("div", "preview-gallery");

        const main = make("div", "preview-main");

        const mainImage = make("img");
        mainImage.alt = item.name;

        function showMainPlaceholder() {

            mainImage.hidden = true;

            if (!main.querySelector(".preview-placeholder")) {

                const holder = make("div", "preview-placeholder");
                holder.appendChild(placeholderIcon());

                main.insertBefore(holder, main.firstChild);

            }

        }

        mainImage.addEventListener("error", showMainPlaceholder);

        main.appendChild(mainImage);

        const counter = make("span", "preview-counter");

        const thumbs = make("div", "preview-thumbs");

        const thumbButtons = [];

        function show(index) {

            if (images.length === 0) {
                showMainPlaceholder();
                return;
            }

            current = (index + images.length) % images.length;

            const holder = main.querySelector(".preview-placeholder");

            if (holder) holder.remove();

            mainImage.hidden = false;
            mainImage.src = images[current];

            counter.textContent = (current + 1) + " / " + images.length;

            thumbButtons.forEach(function (button, i) {
                button.classList.toggle("active", i === current);
            });

        }

        if (images.length > 1) {

            const prev = make("button", "preview-arrow prev");
            prev.type = "button";
            prev.setAttribute("aria-label", "Previous image");
            prev.appendChild(make("i", "fa-solid fa-chevron-left"));
            prev.addEventListener("click", function () { show(current - 1); });

            const next = make("button", "preview-arrow next");
            next.type = "button";
            next.setAttribute("aria-label", "Next image");
            next.appendChild(make("i", "fa-solid fa-chevron-right"));
            next.addEventListener("click", function () { show(current + 1); });

            main.appendChild(prev);
            main.appendChild(next);
            main.appendChild(counter);

            images.forEach(function (url, index) {

                const button = make("button", "preview-thumb");
                button.type = "button";
                button.setAttribute("aria-label", "Show image " + (index + 1));

                const image = make("img");
                image.src = url;
                image.alt = "";

                button.appendChild(image);
                button.addEventListener("click", function () { show(index); });

                thumbs.appendChild(button);
                thumbButtons.push(button);

            });

            /* swipe (phone) */

            let startX = null;

            main.addEventListener("touchstart", function (event) {
                startX = event.touches[0].clientX;
            }, { passive: true });

            main.addEventListener("touchend", function (event) {

                if (startX === null) return;

                const diff = event.changedTouches[0].clientX - startX;

                startX = null;

                if (Math.abs(diff) > 45) show(diff < 0 ? current + 1 : current - 1);

            });

        }

        gallery.appendChild(main);

        if (images.length > 1) gallery.appendChild(thumbs);


        /* ---- info ---- */

        const info = make("div", "preview-info");

        if (item.category) {
            info.appendChild(make("span", "store-category", item.category));
        }

        info.appendChild(make("h2", "preview-name", item.name));
        info.appendChild(make("div", "preview-price", formatPrice(item.price)));

        if (item.description) {
            info.appendChild(make("p", "preview-desc", item.description));
        }

        const actions = make("div", "preview-actions");

        const addBtn = make("button", "preview-cart");
        addBtn.type = "button";
        addBtn.appendChild(make("i", "fa-solid fa-cart-plus"));
        addBtn.appendChild(document.createTextNode(" Add to cart"));

        const buy = make("a", "preview-buy");
        buy.href = "checkout.html?item=" + encodeURIComponent(item.id);
        buy.appendChild(make("i", "fa-solid fa-bolt"));
        buy.appendChild(document.createTextNode(" Buy now"));

        actions.appendChild(addBtn);
        actions.appendChild(buy);

        const added = make("div", "preview-added");
        added.hidden = true;

        addBtn.addEventListener("click", function () {

            if (!window.sparkCart) return;

            added.textContent = "";
            added.hidden = false;

            if (window.sparkCart.add(item.id, 1)) {

                added.appendChild(document.createTextNode("Added to your cart. "));

                const view = make("a", "", "View cart");
                view.href = "cart.html";

                added.appendChild(view);

            } else {

                added.appendChild(document.createTextNode("Your cart is full (max 20 different items)."));

            }

        });

        info.appendChild(actions);
        info.appendChild(added);

        dialog.appendChild(closeBtn);
        dialog.appendChild(gallery);
        dialog.appendChild(info);

        overlay.appendChild(dialog);

        overlay.addEventListener("click", function (event) {
            if (event.target === overlay) closePreview();
        });

        keyHandler = function (event) {

            if (event.key === "Escape") closePreview();
            if (event.key === "ArrowLeft" && images.length > 1) show(current - 1);
            if (event.key === "ArrowRight" && images.length > 1) show(current + 1);

        };

        document.addEventListener("keydown", keyHandler);

        document.body.appendChild(overlay);

        document.body.style.overflow = "hidden";

        show(0);

        closeBtn.focus();

    }


    /* =========================
       PRODUCT CARDS
    ========================= */

    function createCard(item, index) {

        const card = make("article", "store-card");
        card.style.animationDelay = Math.min(index, 8) * 0.06 + "s";
        card.tabIndex = 0;
        card.setAttribute("role", "button");
        card.setAttribute("aria-label", "View " + item.name);

        const images = collectImages(item);

        const imageBox = make("div", "store-image");

        function showPlaceholder() {

            imageBox.textContent = "";

            imageBox.appendChild(placeholderIcon());

        }

        if (images.length > 0) {

            const image = make("img");

            image.alt = item.name;

            image.addEventListener("error", showPlaceholder);

            image.src = images[0];

            imageBox.appendChild(image);

        } else {

            showPlaceholder();

        }

        if (images.length > 1) {

            const count = make("span", "store-photo-count");
            count.appendChild(make("i", "fa-solid fa-images"));
            count.appendChild(document.createTextNode(" " + images.length));

            imageBox.appendChild(count);

        }

        const body = make("div", "store-body");

        if (item.category) {
            body.appendChild(make("span", "store-category", item.category));
        }

        body.appendChild(make("h3", "store-name", item.name));

        if (item.description) {
            body.appendChild(make("p", "store-desc", item.description));
        }

        const footer = make("div", "store-footer");

        footer.appendChild(make("div", "store-price", formatPrice(item.price)));
        footer.appendChild(make("span", "store-view", "View"));

        body.appendChild(footer);

        card.appendChild(imageBox);
        card.appendChild(body);

        card.addEventListener("click", function () { openPreview(item, card); });

        card.addEventListener("keydown", function (event) {

            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openPreview(item, card);
            }

        });

        return card;

    }


    function render(items) {

        if (items.length === 0) {
            showMessage("No items in the store yet. Check back soon!");
            return;
        }

        container.textContent = "";

        const grid = make("div", "store-grid");

        items.forEach(function (item, index) {
            grid.appendChild(createCard(item, index));
        });

        container.appendChild(grid);

    }


    /* =========================
       CART BUTTON (floating) + count
    ========================= */

    const fab = make("a", "cart-fab");
    fab.href = "cart.html";
    fab.setAttribute("aria-label", "Open cart");
    fab.appendChild(make("i", "fa-solid fa-cart-shopping"));

    const fabCount = make("span", "cart-fab-count");
    fabCount.hidden = true;

    fab.appendChild(fabCount);

    document.body.appendChild(fab);

    function updateCartCount() {

        const count = window.sparkCart ? window.sparkCart.count() : 0;

        fabCount.textContent = String(count);
        fabCount.hidden = count === 0;

        const headerCount = document.getElementById("storeCartCount");

        if (headerCount) {
            headerCount.textContent = String(count);
            headerCount.hidden = count === 0;
        }

    }

    document.addEventListener("spark:cart", updateCartCount);

    updateCartCount();


    showMessage("Loading store...");

    window.spark
        .select(
            "store_items",
            "select=id,name,description,price,category,image_url,store_item_images(image_url,sort_order)" +
            "&order=sort_order.asc,created_at.asc"
        )
        .then(render)
        .catch(function () {
            showMessage("Could not load the store. Please try again later.");
        });

});
