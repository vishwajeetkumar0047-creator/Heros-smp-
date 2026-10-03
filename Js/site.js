/* =====================================
   SITE SETTINGS (logo)
   Admin panel se badla hua logo navbar mein dikhata hai.
   Custom logo na ho to HTML wala default logo hi rehta hai.
===================================== */

(function () {

    const spark = window.spark;

    const image = document.querySelector(".logo img");

    if (!spark || !image) return;

    const CACHE_KEY = "sparkLogo";

    const defaultSrc = image.getAttribute("src");


    function show(url) {

        const target = url || defaultSrc;

        if (image.getAttribute("src") !== target) {
            image.setAttribute("src", target);
        }

    }


    /* Pichli baar ka logo turant dikhao (flicker kam karne ke liye) */

    try {

        const cached = localStorage.getItem(CACHE_KEY);

        if (cached) show(cached);

    } catch (error) {}


    /* =========================
       FOOTER SOCIAL LINKS (Discord / YouTube)
       Admin panel (Site tab) se set hote hain. Set na ho to link chhupa rehta hai.
    ========================= */

    spark
        .select("site_settings", "select=key,value&key=in.(discord_url,youtube_url)")
        .then(function (rows) {

            const urls = {};

            rows.forEach(function (row) {

                if (row.value && /^https?:\/\//i.test(row.value)) {
                    urls[row.key.replace("_url", "")] = row.value;
                }

            });

            document.querySelectorAll("[data-social]").forEach(function (link) {

                const url = urls[link.dataset.social];

                if (!url) return;

                link.href = url;
                link.target = "_blank";
                link.rel = "noopener";
                link.hidden = false;

            });

            /* dono links na hon to poora SOCIALS column chhupa do */

            document.querySelectorAll(".footer-column").forEach(function (column) {

                const links = column.querySelectorAll("[data-social]");

                if (links.length === 0) return;

                const anyVisible = Array.prototype.some.call(links, function (link) {
                    return !link.hidden;
                });

                column.hidden = !anyVisible;

            });

        })
        .catch(function () {

            document.querySelectorAll(".footer-column").forEach(function (column) {

                if (column.querySelector("[data-social]")) column.hidden = true;

            });

        });


    spark
        .select("site_settings", "select=value&key=eq.logo_url")
        .then(function (rows) {

            const url = rows.length > 0 && rows[0].value ? rows[0].value : "";

            try {

                if (url) {
                    localStorage.setItem(CACHE_KEY, url);
                } else {
                    localStorage.removeItem(CACHE_KEY);
                }

            } catch (error) {}

            show(url);

        })
        .catch(function () {});

})();

/* =========================
   MOBILE MENU: Cart link (count ke saath)
========================= */

(function () {

    const mobileMenu = document.getElementById("mobileMenu");

    if (!mobileMenu || mobileMenu.querySelector('a[href="cart.html"]')) return;

    function cartCount() {

        try {

            const lines = JSON.parse(localStorage.getItem("sparkCart") || "[]");

            if (!Array.isArray(lines)) return 0;

            return lines.reduce(function (total, line) {
                return total + (line && Number.isInteger(line.qty) ? line.qty : 0);
            }, 0);

        } catch (error) {

            return 0;

        }

    }

    const link = document.createElement("a");

    link.href = "cart.html";

    const icon = document.createElement("i");
    icon.className = "fa-solid fa-cart-shopping";

    const label = document.createElement("span");

    link.appendChild(icon);
    link.appendChild(document.createTextNode(" "));
    link.appendChild(label);

    function update() {

        const count = cartCount();

        label.textContent = count > 0 ? "Cart (" + count + ")" : "Cart";

    }

    update();

    document.addEventListener("spark:cart", update);
    window.addEventListener("storage", update);

    const divider = mobileMenu.querySelector(".mobile-menu-divider");

    if (divider) {
        mobileMenu.insertBefore(link, divider);
    } else {
        mobileMenu.appendChild(link);
    }

})();
