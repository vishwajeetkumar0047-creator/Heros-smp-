/* =====================================
   SINGLE FORM PAGE JS  (form.html?f=slug)
   Form + questions Supabase se aate hain, jawab wapas Supabase mein jaate hain
===================================== */

document.addEventListener("DOMContentLoaded", async function () {

    const body = document.getElementById("applyBody");
    const titleEl = document.getElementById("applyTitle");
    const descEl = document.getElementById("applyDesc");

    if (!body || !window.spark) return;

    const spark = window.spark;
    const client = spark.client;


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

    /* koi message + optional buttons dikhana */

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

    function parseOptions(text) {

        return (text || "")
            .split("\n")
            .map(function (line) { return line.trim(); })
            .filter(function (line) { return line !== ""; });

    }


    /* =========================
       LOAD FORM
    ========================= */

    const slug = new URLSearchParams(window.location.search).get("f");

    if (!slug || !/^[a-z0-9-]{2,60}$/.test(slug)) {

        titleEl.textContent = "Form not found";

        showGate("This form does not exist.", [link("See all forms", "forms.html")]);

        return;

    }

    let form = null;
    let fields = [];

    try {

        const forms = await spark.select(
            "forms",
            "select=id,slug,title,description,require_login&slug=eq." + encodeURIComponent(slug)
        );

        form = forms[0] || null;

        if (form) {

            fields = await spark.select(
                "form_fields",
                "select=id,label,field_type,options,is_required&form_id=eq." + form.id +
                "&order=sort_order.asc,created_at.asc"
            );

        }

    } catch (error) {

        titleEl.textContent = "Something went wrong";

        showGate("Could not load this form. Please try again later.", [link("Back to forms", "forms.html")]);

        return;

    }

    if (!form) {

        titleEl.textContent = "Form not found";

        showGate(
            "This form is closed or does not exist.",
            [link("See all forms", "forms.html")]
        );

        return;

    }

    titleEl.textContent = form.title;
    descEl.textContent = form.description || "";

    document.title = form.title + " | HEROS SMP";


    /* login zaroori hai to check */

    if (form.require_login) {

        let loggedIn = false;

        if (client) {

            const session = await client.auth.getSession();

            loggedIn = !!(session.data && session.data.session);

        }

        if (!loggedIn) {

            const next = encodeURIComponent("form.html?f=" + form.slug);

            showGate(
                "You need to be logged in to fill out this form.",
                [
                    link("Login", "login.html?next=" + next),
                    link("Create account", "signup.html", true)
                ]
            );

            return;

        }

    }

    if (fields.length === 0) {

        showGate("This form has no questions yet.", [link("Back to forms", "forms.html")]);

        return;

    }


    /* =========================
       BUILD FORM
    ========================= */

    const formEl = make("form");

    formEl.noValidate = true;

    const controls = [];   /* { field, wrapper, read() } */

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    function labelWithMark(field, forId) {

        const label = make("label", "", field.label);

        if (forId) label.htmlFor = forId;

        if (field.is_required) {
            label.appendChild(make("span", "apply-required", " *"));
        }

        return label;

    }

    function buildField(field) {

        const wrapper = make("div", "field");

        const inputId = "field_" + field.id;

        let read;

        if (field.field_type === "checkbox") {

            const label = make("label", "check");

            const input = make("input");
            input.type = "checkbox";
            input.id = inputId;

            label.appendChild(input);

            const text = make("span", "", field.label);

            if (field.is_required) {
                text.appendChild(make("span", "apply-required", " *"));
            }

            label.appendChild(text);

            wrapper.appendChild(label);

            read = function () { return input.checked ? "Yes" : ""; };

        } else if (field.field_type === "radio") {

            wrapper.appendChild(labelWithMark(field));

            const group = make("div", "apply-options");

            parseOptions(field.options).forEach(function (option, index) {

                const label = make("label", "check");

                const input = make("input");
                input.type = "radio";
                input.name = inputId;
                input.value = option;
                input.id = inputId + "_" + index;

                label.appendChild(input);
                label.appendChild(make("span", "", option));

                group.appendChild(label);

            });

            wrapper.appendChild(group);

            read = function () {

                const picked = group.querySelector("input:checked");

                return picked ? picked.value : "";

            };

        } else if (field.field_type === "select") {

            wrapper.appendChild(labelWithMark(field, inputId));

            const select = make("select", "apply-control");
            select.id = inputId;

            const placeholder = make("option", "", "Select...");
            placeholder.value = "";

            select.appendChild(placeholder);

            parseOptions(field.options).forEach(function (option) {

                const item = make("option", "", option);
                item.value = option;

                select.appendChild(item);

            });

            wrapper.appendChild(select);

            read = function () { return select.value; };

        } else if (field.field_type === "textarea") {

            wrapper.appendChild(labelWithMark(field, inputId));

            const area = make("textarea", "apply-control");
            area.id = inputId;
            area.rows = 4;
            area.maxLength = 2000;

            wrapper.appendChild(area);

            read = function () { return area.value.trim(); };

        } else {

            wrapper.appendChild(labelWithMark(field, inputId));

            const input = make("input", "apply-control");
            input.id = inputId;
            input.type = field.field_type === "email" ? "email"
                : field.field_type === "number" ? "number" : "text";
            input.maxLength = 300;

            if (field.field_type === "number") input.inputMode = "numeric";

            wrapper.appendChild(input);

            read = function () { return input.value.trim(); };

        }

        wrapper.appendChild(make("small", "field-error"));

        wrapper.addEventListener("input", function () { setError(wrapper, ""); });
        wrapper.addEventListener("change", function () { setError(wrapper, ""); });

        controls.push({ field: field, wrapper: wrapper, read: read });

        return wrapper;

    }

    function setError(wrapper, message) {

        wrapper.classList.toggle("invalid", message !== "");

        wrapper.querySelector(".field-error").textContent = message;

    }

    fields.forEach(function (field) {
        formEl.appendChild(buildField(field));
    });

    if (form.require_login) {

        formEl.appendChild(make(
            "p",
            "apply-note",
            "Your account username and email will be attached to this application."
        ));

    }

    const submitBtn = make("button", "auth-btn", "Submit");
    submitBtn.type = "submit";

    formEl.appendChild(submitBtn);

    const status = make("p", "auth-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    formEl.appendChild(status);

    body.textContent = "";
    body.appendChild(formEl);


    /* =========================
       SUBMIT
    ========================= */

    function showStatus(type, message) {

        status.className = "auth-status " + type;

        status.textContent = message;

    }

    function validate() {

        let valid = true;

        controls.forEach(function (item) {

            const value = item.read();

            let message = "";

            if (item.field.is_required && value === "") {

                message = item.field.field_type === "checkbox"
                    ? "Please tick this box"
                    : "This field is required";

            } else if (value !== "" && item.field.field_type === "email" &&
                !emailPattern.test(value)) {

                message = "Enter a valid email address";

            } else if (value !== "" && item.field.field_type === "number" &&
                !Number.isFinite(Number(value))) {

                message = "Enter a valid number";

            }

            setError(item.wrapper, message);

            if (message) valid = false;

        });

        return valid;

    }

    formEl.addEventListener("submit", async function (event) {

        event.preventDefault();

        status.className = "auth-status";
        status.textContent = "";

        if (!validate()) {

            const firstBad = formEl.querySelector(".field.invalid");

            if (firstBad) firstBad.scrollIntoView({ behavior: "smooth", block: "center" });

            return;

        }

        if (!client) {

            showStatus("error", "Could not connect to the server. Please try again later.");

            return;

        }

        const answers = [];

        controls.forEach(function (item) {

            const value = item.read();

            if (value !== "") {
                answers.push({ id: item.field.id, label: item.field.label, value: value });
            }

        });

        submitBtn.disabled = true;
        submitBtn.textContent = "Please wait...";

        let result;

        try {

            result = await client
                .from("form_submissions")
                .insert({ form_id: form.id, answers: answers });

        } catch (error) {

            result = { error: { message: "network" } };

        }

        if (result.error) {

            submitBtn.disabled = false;
            submitBtn.textContent = "Submit";

            if (result.error.code === "42501") {

                showStatus(
                    "error",
                    "You can't submit this form right now. It may be closed, or you need to log in."
                );

            } else {

                showStatus("error", "Could not submit. Please check your connection and try again.");

            }

            return;

        }

        titleEl.textContent = "Thank you!";
        descEl.textContent = "";

        showGate(
            "Your application has been submitted. We will get back to you soon.",
            [link("Back to forms", "forms.html", true), link("Home", "index.html")]
        );

    });

});
