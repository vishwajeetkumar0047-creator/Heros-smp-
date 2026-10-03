/* =====================================
   AUTH FORMS JS  (Supabase Auth)
   Login / Sign Up / Forgot Password / Reset Password
===================================== */

document.addEventListener("DOMContentLoaded", function () {

    const form = document.getElementById("authForm");

    if (!form) return;

    const formType = form.dataset.form;
    const statusBox = document.getElementById("authStatus");
    const submitBtn = form.querySelector(".auth-btn");
    const submitLabel = submitBtn ? submitBtn.textContent.trim() : "";

    const client = window.spark ? window.spark.client : null;


    /* =========================
       HELPERS
    ========================= */

    function getField(input) {
        return input.closest(".field");
    }

    function setError(input, message) {

        const field = getField(input);

        field.classList.add("invalid");

        field.querySelector(".field-error").textContent = message;

    }

    function clearError(input) {

        const field = getField(input);

        field.classList.remove("invalid");

        field.querySelector(".field-error").textContent = "";

    }

    function showStatus(type, message) {

        statusBox.className = "auth-status " + type;

        statusBox.textContent = message;

    }

    function clearStatus() {

        statusBox.className = "auth-status";

        statusBox.textContent = "";

    }

    function setLoading(loading) {

        if (!submitBtn) return;

        submitBtn.disabled = loading;

        submitBtn.textContent = loading ? "Please wait..." : submitLabel;

    }

    function pageUrl(name) {

        return new URL(name, window.location.href).href;

    }

    /* login ke baad wapas kahan jana hai (?next=form.html?f=...) */

    function nextPage() {

        const next = new URLSearchParams(window.location.search).get("next");

        if (next && /^[A-Za-z0-9_-]+\.html(\?[A-Za-z0-9_=&%.-]*)?$/.test(next)) {
            return next;
        }

        return "index.html";

    }

    function isWebPage() {

        return window.location.protocol === "http:" ||
            window.location.protocol === "https:";

    }


    /* =========================
       SHOW / HIDE PASSWORD
    ========================= */

    form.querySelectorAll(".toggle-pass").forEach(function (button) {

        button.addEventListener("click", function () {

            const input = button.parentElement.querySelector("input");
            const icon = button.querySelector("i");

            const show = input.type === "password";

            input.type = show ? "text" : "password";

            icon.classList.toggle("fa-eye", !show);
            icon.classList.toggle("fa-eye-slash", show);

            button.setAttribute(
                "aria-label",
                show ? "Hide password" : "Show password"
            );

        });

    });


    /* =========================
       PASSWORD STRENGTH
    ========================= */

    const passwordInput = form.querySelector("#password");
    const strengthFill = document.getElementById("strengthFill");
    const strengthText = document.getElementById("strengthText");

    function passwordScore(value) {

        let score = 0;

        if (value.length >= 8) score++;
        if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
        if (/\d/.test(value)) score++;
        if (/[^A-Za-z0-9]/.test(value)) score++;

        return score;

    }

    if ((formType === "signup" || formType === "reset") &&
        passwordInput && strengthFill) {

        const levels = [
            { width: "0%",   color: "#dc4035", text: "Use 8+ characters with letters and numbers" },
            { width: "25%",  color: "#dc4035", text: "Weak password" },
            { width: "50%",  color: "#f0a020", text: "Okay password" },
            { width: "75%",  color: "#7cb342", text: "Good password" },
            { width: "100%", color: "#2e9e4f", text: "Strong password" }
        ];

        passwordInput.addEventListener("input", function () {

            const level = levels[
                passwordInput.value ? passwordScore(passwordInput.value) : 0
            ];

            strengthFill.style.width = level.width;
            strengthFill.style.background = level.color;
            strengthText.textContent = level.text;

        });

    }


    /* =========================
       VALIDATION
    ========================= */

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    const usernamePattern = /^[A-Za-z0-9_]{3,16}$/;

    function validate() {

        let valid = true;

        function check(id, test, message) {

            const input = form.querySelector("#" + id);

            if (!input) return;

            const value = input.type === "checkbox"
                ? input.checked
                : input.value.trim();

            if (!test(value, input)) {

                setError(input, message);

                valid = false;

            } else {

                clearError(input);

            }

        }

        function checkNewPassword() {

            check("password", function (v, i) {
                return i.value.length >= 8 &&
                    /[A-Za-z]/.test(i.value) &&
                    /\d/.test(i.value);
            }, "Minimum 8 characters, with letters and numbers");

            check("confirm", function (v, i) {
                return i.value.length > 0 &&
                    i.value === form.querySelector("#password").value;
            }, "Passwords do not match");

        }

        if (formType === "login") {

            check("email", function (v) { return emailPattern.test(v); },
                "Enter a valid email address");

            check("password", function (v, i) { return i.value.length > 0; },
                "Enter your password");

        }

        if (formType === "signup") {

            check("username", function (v) { return usernamePattern.test(v); },
                "3-16 characters: letters, numbers and underscore only");

            check("email", function (v) { return emailPattern.test(v); },
                "Enter a valid email address");

            checkNewPassword();

            check("terms", function (v) { return v === true; },
                "You must accept the Terms and Privacy Policy");

        }

        if (formType === "forgot") {

            check("email", function (v) { return emailPattern.test(v); },
                "Enter a valid email address");

        }

        if (formType === "reset") {

            checkNewPassword();

        }

        return valid;

    }


    /* clear error while typing */

    form.querySelectorAll("input").forEach(function (input) {

        const eventName = input.type === "checkbox" ? "change" : "input";

        input.addEventListener(eventName, function () {

            clearError(input);

            clearStatus();

        });

    });


    /* =========================
       SUPABASE ACTIONS
    ========================= */

    function loginErrorMessage(error) {

        const text = (error.message || "").toLowerCase();

        if (text.includes("invalid login credentials")) {
            return "Incorrect email or password.";
        }

        if (text.includes("email not confirmed")) {
            return "Please confirm your email first. Check your inbox (and spam folder).";
        }

        if (error.status === 429 || text.includes("rate limit")) {
            return "Too many attempts. Please wait a few minutes and try again.";
        }

        return error.message || "Something went wrong. Please try again.";

    }

    async function doLogin() {

        const email = form.querySelector("#email").value.trim();
        const password = form.querySelector("#password").value;

        const result = await client.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (result.error) {
            showStatus("error", loginErrorMessage(result.error));
            return;
        }

        showStatus("success", "Logged in! Redirecting...");

        setTimeout(function () {
            window.location.href = nextPage();
        }, 700);

    }

    async function doSignup() {

        const usernameInput = form.querySelector("#username");

        const username = usernameInput.value.trim();
        const email = form.querySelector("#email").value.trim();
        const password = form.querySelector("#password").value;

        /* username pehle se liya hua to nahi? */

        const availability = await client.rpc("username_available", {
            p_username: username
        });

        if (availability.error) {
            showStatus("error", "Could not check the username. Please try again.");
            return;
        }

        if (availability.data === false) {
            setError(usernameInput, "This username is already taken");
            usernameInput.focus();
            return;
        }

        const options = { data: { username: username } };

        if (isWebPage()) {
            options.emailRedirectTo = pageUrl("login.html");
        }

        const result = await client.auth.signUp({
            email: email,
            password: password,
            options: options
        });

        if (result.error) {

            const text = (result.error.message || "").toLowerCase();

            if (text.includes("already registered")) {
                showStatus("error", "This email is already registered. Try logging in.");
            } else if (result.error.status === 429 || text.includes("rate limit")) {
                showStatus("error", "Too many attempts. Please wait a few minutes and try again.");
            } else {
                showStatus("error", result.error.message);
            }

            return;

        }

        const user = result.data.user;

        /* email pehle se registered (confirmation ON hone par yahi aata hai) */

        if (user && user.identities && user.identities.length === 0) {
            showStatus("error", "This email is already registered. Try logging in.");
            return;
        }

        /* confirmation OFF ho to seedha login ho jata hai */

        if (result.data.session) {

            showStatus("success", "Account created! Redirecting...");

            setTimeout(function () {
                window.location.href = nextPage();
            }, 700);

            return;

        }

        form.reset();

        showStatus(
            "success",
            "Account created! We sent a confirmation link to your email. " +
            "Open it to activate your account, then log in."
        );

    }

    async function doForgot() {

        const email = form.querySelector("#email").value.trim();

        const options = {};

        if (isWebPage()) {
            options.redirectTo = pageUrl("reset-password.html");
        }

        const result = await client.auth.resetPasswordForEmail(email, options);

        if (result.error && (result.error.status === 429 ||
            (result.error.message || "").toLowerCase().includes("rate limit"))) {

            showStatus("error", "Too many requests. Please wait a few minutes and try again.");

            return;

        }

        /* email registered hai ya nahi, ye nahi batate (privacy) */

        showStatus(
            "success",
            "If an account exists for that email, a reset link has been sent. " +
            "Check your inbox and spam folder."
        );

    }

    async function doReset() {

        const session = await client.auth.getSession();

        if (!session.data.session) {

            showStatus(
                "error",
                "This reset link is invalid or has expired. Please request a new one."
            );

            return;

        }

        const password = form.querySelector("#password").value;

        const result = await client.auth.updateUser({ password: password });

        if (result.error) {
            showStatus("error", result.error.message);
            return;
        }

        showStatus("success", "Password updated! Redirecting to login...");

        try {
            await client.auth.signOut();
        } catch (error) {}

        setTimeout(function () {
            window.location.href = "login.html";
        }, 1500);

    }


    /* =========================
       PAGE LOAD CHECKS
    ========================= */

    if (client && (formType === "login" || formType === "signup")) {

        /* pehle se logged in ho to login/signup page ki zaroorat nahi */

        client.auth.getSession().then(function (result) {

            if (result.data && result.data.session) {
                window.location.replace(nextPage());
            }

        });

    }

    if (formType === "reset") {

        /* expired / galat link ka error URL mein aata hai */

        if (window.location.hash.includes("error_description")) {

            showStatus(
                "error",
                "This reset link is invalid or has expired. Please request a new one."
            );

        }

    }


    /* =========================
       SUBMIT
    ========================= */

    form.addEventListener("submit", async function (e) {

        e.preventDefault();

        clearStatus();

        if (!validate()) {

            const firstInvalid = form.querySelector(".field.invalid input");

            if (firstInvalid) firstInvalid.focus();

            return;

        }

        if (!client) {

            showStatus("error", "Could not connect to the server. Please try again later.");

            return;

        }

        setLoading(true);

        try {

            if (formType === "login") await doLogin();
            if (formType === "signup") await doSignup();
            if (formType === "forgot") await doForgot();
            if (formType === "reset") await doReset();

        } catch (error) {

            showStatus("error", "Network error. Please check your connection and try again.");

        }

        setLoading(false);

    });

});
