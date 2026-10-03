/* =====================================
   SESSION (navbar login state)
   - Logged in ho to Login button "Logout" ban jata hai
   - Admin ho to navbar mein "Admin" link aata hai
===================================== */

(function () {

    const spark = window.spark;

    if (!spark || !spark.client) return;

    const client = spark.client;

    const desktopBtn = document.querySelector(".login-btn");
    const mobileBtn = document.getElementById("mobileLoginBtn");


    async function logout(event) {

        event.preventDefault();

        try {
            await client.auth.signOut();
        } catch (error) {}

        window.location.href = "index.html";

    }


    function setText(element, text) {

        if (!element) return;

        /* icon (<i>) ko chhod kar sirf text badlo */

        let done = false;

        element.childNodes.forEach(function (node) {

            if (!done && node.nodeType === 3 && node.textContent.trim() !== "") {
                node.textContent = " " + text + " ";
                done = true;
            }

        });

        if (!done) element.textContent = text;

    }


    function showLoggedIn() {

        [desktopBtn, mobileBtn].forEach(function (button) {

            if (!button) return;

            button.setAttribute("href", "#");

            button.classList.add("logged-in");

            button.addEventListener("click", logout);

        });

        setText(desktopBtn, "Logout");
        setText(mobileBtn, "Logout");

        if (mobileBtn) {

            const icon = mobileBtn.querySelector("i");

            if (icon) {
                icon.classList.remove("fa-right-to-bracket");
                icon.classList.add("fa-right-from-bracket");
            }

        }

    }


    function addAdminLinks() {

        const onAdminPage = /admin(\.html)?$/.test(window.location.pathname);

        const desktopMenu = document.querySelector(".nav-menu");

        if (desktopMenu && !desktopMenu.querySelector('a[href="admin.html"]')) {

            const link = document.createElement("a");

            link.href = "admin.html";
            link.textContent = "Admin";

            if (onAdminPage) link.classList.add("active");

            desktopMenu.appendChild(link);

        }

        const mobileMenu = document.getElementById("mobileMenu");

        if (mobileMenu && !mobileMenu.querySelector('a[href="admin.html"]')) {

            const link = document.createElement("a");

            link.href = "admin.html";

            if (onAdminPage) link.classList.add("active");

            const icon = document.createElement("i");
            icon.className = "fa-solid fa-user-gear";

            link.appendChild(icon);
            link.appendChild(document.createTextNode(" Admin"));

            const divider = mobileMenu.querySelector(".mobile-menu-divider");

            if (divider) {
                mobileMenu.insertBefore(link, divider);
            } else {
                mobileMenu.appendChild(link);
            }

        }

    }


    function addOrdersLinks() {

        /* desktop navbar mein jagah kam hai - wahan "My Orders" Store page par hai */

        const mobileMenu = document.getElementById("mobileMenu");

        if (mobileMenu && !mobileMenu.querySelector('a[href="orders.html"]')) {

            const link = document.createElement("a");

            link.href = "orders.html";

            const icon = document.createElement("i");
            icon.className = "fa-solid fa-receipt";

            link.appendChild(icon);
            link.appendChild(document.createTextNode(" My Orders"));

            const divider = mobileMenu.querySelector(".mobile-menu-divider");

            if (divider) {
                mobileMenu.insertBefore(link, divider);
            } else {
                mobileMenu.appendChild(link);
            }

        }

    }


    client.auth.getSession().then(async function (result) {

        const session = result.data && result.data.session;

        if (!session) return;

        showLoggedIn();

        addOrdersLinks();

        try {

            const response = await client.rpc("is_admin");

            if (response.data === true) addAdminLinks();

        } catch (error) {}

    });

})();
