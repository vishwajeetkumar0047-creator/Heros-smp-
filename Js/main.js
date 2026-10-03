/* =====================================
   SHARED JS (navbar + theme)
   Used by: login, signup, forgot-password
===================================== */

(function () {

    /* =========================
       MOBILE MENU
    ========================= */

    const menuToggle = document.getElementById("menuToggle");
    const mobileMenu = document.getElementById("mobileMenu");

    function setMenu(open) {

        if (!menuToggle || !mobileMenu) return;

        mobileMenu.classList.toggle("active", open);

        const icon = menuToggle.querySelector("i");

        if (icon) {
            icon.classList.toggle("fa-xmark", open);
            icon.classList.toggle("fa-bars", !open);
        }

    }

    if (menuToggle && mobileMenu) {

        menuToggle.addEventListener("click", function () {
            setMenu(!mobileMenu.classList.contains("active"));
        });

        mobileMenu.querySelectorAll("a").forEach(function (link) {
            link.addEventListener("click", function () {
                setMenu(false);
            });
        });

        document.addEventListener("click", function (e) {

            if (
                !mobileMenu.contains(e.target) &&
                !menuToggle.contains(e.target) &&
                mobileMenu.classList.contains("active")
            ) {
                setMenu(false);
            }

        });

    }


    /* =========================
       THEME TOGGLE
    ========================= */

    const themeBtn = document.getElementById("themeBtn");
    const themeIcon = themeBtn ? themeBtn.querySelector("i") : null;

    function setIcon(isDark) {

        if (!themeIcon) return;

        themeIcon.classList.toggle("fa-moon", isDark);
        themeIcon.classList.toggle("fa-sun", !isDark);

    }

    let savedTheme = null;

    try {
        savedTheme = localStorage.getItem("sparkTheme");
    } catch (error) {}

    if (savedTheme === "dark") {
        document.body.classList.add("dark");
    }

    setIcon(document.body.classList.contains("dark"));

    if (themeBtn) {

        themeBtn.addEventListener("click", function () {

            const isDark = document.body.classList.toggle("dark");

            setIcon(isDark);

            try {
                localStorage.setItem("sparkTheme", isDark ? "dark" : "light");
            } catch (error) {}

        });

    }


    /* =========================
       ACTIVE NAV LINK
    ========================= */

    function cleanPage(path) {

        let page = path.split("#")[0].split("/").pop();

        page = page.replace(/\.html$/, "");

        return page === "" ? "index" : page;

    }

    const currentPage = cleanPage(window.location.pathname);

    document
        .querySelectorAll(".nav-menu a, .mobile-menu a:not(#mobileLoginBtn)")
        .forEach(function (link) {

            if (cleanPage(link.getAttribute("href")) === currentPage) {
                link.classList.add("active");
            }

        });

})();
