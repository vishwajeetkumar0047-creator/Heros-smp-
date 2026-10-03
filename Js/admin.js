/* =====================================
   ADMIN PANEL JS
   Staff + Store items manage karna (Supabase)

   NOTE: asli security Supabase ke RLS policies se hai
   (sirf admins table wala confirmed email likh sakta hai).
   Ye page sirf UI hai.
===================================== */

document.addEventListener("DOMContentLoaded", function () {

    const client = window.spark ? window.spark.client : null;

    const gate = document.getElementById("adminGate");
    const app = document.getElementById("adminApp");
    const toast = document.getElementById("adminToast");

    if (!gate || !app) return;


    /* =========================
       HELPERS
    ========================= */

    function el(tag, className, text) {

        const element = document.createElement(tag);

        if (className) element.className = className;

        if (text !== undefined && text !== null) element.textContent = text;

        return element;

    }

    let toastTimer = null;

    function notify(type, message) {

        toast.className = "admin-toast " + type;

        toast.textContent = message;

        clearTimeout(toastTimer);

        toastTimer = setTimeout(function () {

            toast.className = "admin-toast";

            toast.textContent = "";

        }, 4500);

    }

    function errorText(error) {

        if (error.code === "23505") return "This entry already exists.";

        if (error.code === "42501") return "Not allowed.";

        return error.message || "Something went wrong.";

    }

    function showGate(message, linkText, linkHref) {

        app.hidden = true;
        gate.hidden = false;

        gate.textContent = "";

        gate.appendChild(el("p", "", message));

        if (linkHref) {

            const link = el("a", "admin-link-btn", linkText);

            link.href = linkHref;

            gate.appendChild(link);

        }

    }

    function formatPrice(value) {

        const number = Number(value);

        const text = Number.isInteger(number) ? String(number) : number.toFixed(2);

        return window.spark.config.currency + text;

    }


    /* =========================
       CRUD MANAGER (staff / store dono ke liye)
    ========================= */

    function createManager(config) {

        const form = document.getElementById(config.formId);
        const list = document.getElementById(config.listId);
        const title = document.getElementById(config.titleId);
        const submitBtn = form.querySelector('[type="submit"]');
        const cancelBtn = form.querySelector("[data-cancel]");

        let editingId = null;


        function readForm() {

            const payload = {};

            config.fields.forEach(function (field) {

                const input = form.elements[field.name];

                if (field.type === "checkbox") {

                    payload[field.name] = input.checked;

                } else if (field.type === "nullable_number") {

                    const value = input.value.trim();

                    payload[field.name] = value === "" ? null : Number(value);

                } else if (field.type === "number") {

                    const value = input.value.trim();

                    payload[field.name] = value === "" ? 0 : Number(value);

                } else {

                    const value = input.value.trim();

                    payload[field.name] = value === "" ? null : value;

                }

            });

            if (config.beforeSave) config.beforeSave(payload);

            return payload;

        }


        function resetForm() {

            form.reset();

            editingId = null;

            submitBtn.textContent = "Add";

            title.textContent = config.addTitle;

            cancelBtn.hidden = true;

        }


        function fillForm(row) {

            editingId = row.id;

            config.fields.forEach(function (field) {

                const input = form.elements[field.name];

                if (field.type === "checkbox") {

                    input.checked = !!row[field.name];

                } else {

                    input.value = row[field.name] === null ||
                        row[field.name] === undefined ? "" : row[field.name];

                    /* image preview refresh ke liye */

                    input.dispatchEvent(new Event("input", { bubbles: true }));

                }

            });

            submitBtn.textContent = "Update";

            title.textContent = config.editTitle;

            cancelBtn.hidden = false;

            form.scrollIntoView({ behavior: "smooth", block: "center" });

        }


        async function remove(row) {

            const question = config.confirmText
                ? config.confirmText(row)
                : 'Delete "' + config.label(row) + '"?';

            if (!window.confirm(question)) return;

            const result = await client
                .from(config.table)
                .delete()
                .eq("id", row.id)
                .select();

            if (result.error) {
                notify("error", errorText(result.error));
                return;
            }

            if (!result.data || result.data.length === 0) {
                notify("error", "Not allowed. Please log in again.");
                return;
            }

            if (editingId === row.id) resetForm();

            notify("success", "Deleted.");

            load();

            if (config.afterChange) config.afterChange();

        }


        function renderRow(row) {

            const wrapper = el("div", "admin-row");

            const main = config.renderMain(row, el);

            const actions = el("div", "admin-row-actions");

            const editBtn = el("button", "admin-btn small secondary", "Edit");
            editBtn.type = "button";
            editBtn.addEventListener("click", function () { fillForm(row); });

            const deleteBtn = el("button", "admin-btn small danger", "Delete");
            deleteBtn.type = "button";
            deleteBtn.addEventListener("click", function () { remove(row); });

            if (config.extraActions) {

                config.extraActions(row).forEach(function (button) {
                    actions.appendChild(button);
                });

            }

            actions.appendChild(editBtn);
            actions.appendChild(deleteBtn);

            wrapper.appendChild(main);
            wrapper.appendChild(actions);

            return wrapper;

        }


        async function load() {

            list.textContent = "";

            list.appendChild(el("p", "admin-empty", "Loading..."));

            const result = config.query
                ? await config.query()
                : await client
                    .from(config.table)
                    .select("*")
                    .order("sort_order", { ascending: true })
                    .order(config.secondOrder, { ascending: true });

            list.textContent = "";

            if (result.error) {
                list.appendChild(el("p", "admin-empty", "Could not load: " + errorText(result.error)));
                return;
            }

            if (config.onLoaded) config.onLoaded(result.data);

            if (result.data.length === 0) {
                list.appendChild(el("p", "admin-empty", "Nothing added yet."));
                return;
            }

            result.data.forEach(function (row) {
                list.appendChild(renderRow(row));
            });

        }


        form.addEventListener("submit", async function (event) {

            event.preventDefault();

            const payload = readForm();

            if (config.validate) {

                const problem = config.validate(payload);

                if (problem) {
                    notify("error", problem);
                    return;
                }

            }

            if (!editingId && config.extraPayload) {
                Object.assign(payload, config.extraPayload());
            }

            submitBtn.disabled = true;

            let result;

            if (editingId) {

                result = await client
                    .from(config.table)
                    .update(payload)
                    .eq("id", editingId)
                    .select();

            } else {

                result = await client
                    .from(config.table)
                    .insert(payload)
                    .select();

            }

            submitBtn.disabled = false;

            if (result.error) {
                notify("error", errorText(result.error));
                return;
            }

            if (!result.data || result.data.length === 0) {
                notify("error", "Not allowed. Please log in again.");
                return;
            }

            notify("success", editingId ? "Updated." : "Added.");

            resetForm();

            load();

            if (config.afterChange) config.afterChange();

        });

        cancelBtn.addEventListener("click", resetForm);

        return { load: load, reset: resetForm };

    }


    /* =========================
       IMAGE PICKER (gallery se upload)
       Images Supabase Storage ke "site-images" bucket mein jaati hain
    ========================= */

    const IMAGE_BUCKET = "site-images";
    const MAX_ORIGINAL_SIZE = 25 * 1024 * 1024;   /* phone photo ka max size */
    const MAX_IMAGE_SIDE = 1200;                  /* is se badi image chhoti kar di jati hai */

    const extensions = {
        "image/webp": "webp",
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/gif": "gif"
    };

    function loadImage(file) {

        return new Promise(function (resolve, reject) {

            const url = URL.createObjectURL(file);
            const image = new Image();

            image.onload = function () {
                URL.revokeObjectURL(url);
                resolve(image);
            };

            image.onerror = function () {
                URL.revokeObjectURL(url);
                reject(new Error("Could not read this image. Try a PNG or JPG."));
            };

            image.src = url;

        });

    }

    /* Badi photo ko chhota karke upload ke layer tayyar karna */

    async function prepareImage(file) {

        if (file.type === "image/gif") return file;

        const image = await loadImage(file);

        const longSide = Math.max(image.naturalWidth, image.naturalHeight);
        const scale = Math.min(1, MAX_IMAGE_SIDE / longSide);

        const canvas = document.createElement("canvas");

        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);

        const blob = await new Promise(function (resolve) {
            canvas.toBlob(resolve, "image/webp", 0.85);
        });

        if (blob && (scale < 1 || blob.size < file.size)) return blob;

        return file;

    }

    async function uploadImage(file, folder) {

        const blob = await prepareImage(file);

        const extension = extensions[blob.type];

        if (!extension) {
            throw new Error("Please use a PNG, JPG, WEBP or GIF image.");
        }

        const path = folder + "/" + Date.now() + "-" +
            Math.random().toString(36).slice(2, 8) + "." + extension;

        const storage = client.storage.from(IMAGE_BUCKET);

        const result = await storage.upload(path, blob, {
            contentType: blob.type,
            cacheControl: "31536000",
            upsert: false
        });

        if (result.error) {

            const text = (result.error.message || "").toLowerCase();

            if (text.includes("row-level security") || text.includes("unauthorized")) {
                throw new Error("Not allowed. Please log in again.");
            }

            if (text.includes("exceeded") || text.includes("too large")) {
                throw new Error("This image is too large (max 5 MB).");
            }

            throw new Error(result.error.message || "Upload failed.");

        }

        return storage.getPublicUrl(path).data.publicUrl;

    }

    function initImagePicker(wrapper) {

        const folder = wrapper.dataset.folder;

        const fileInput = wrapper.querySelector("[data-file]");
        const chooseBtn = wrapper.querySelector("[data-choose]");
        const clearBtn = wrapper.querySelector("[data-clear]");
        const urlInput = wrapper.querySelector('input[type="text"]');
        const preview = wrapper.querySelector(".admin-image-preview img");
        const placeholder = wrapper.querySelector(".admin-image-preview i");
        const status = wrapper.querySelector(".admin-image-status");

        const form = wrapper.closest("form");
        const submitBtn = form.querySelector('[type="submit"]');

        function setStatus(type, message) {

            status.className = "admin-image-status" + (type ? " " + type : "");

            status.textContent = message;

        }

        function refresh() {

            const value = urlInput.value.trim();

            if (value) {

                preview.src = value;
                preview.hidden = false;
                placeholder.hidden = true;
                clearBtn.hidden = false;

            } else {

                preview.removeAttribute("src");
                preview.hidden = true;
                placeholder.hidden = false;
                clearBtn.hidden = true;

            }

        }

        function setBusy(busy) {

            chooseBtn.disabled = busy;
            clearBtn.disabled = busy;
            submitBtn.disabled = busy;

        }

        preview.addEventListener("error", function () {
            preview.hidden = true;
            placeholder.hidden = false;
        });

        urlInput.addEventListener("input", refresh);

        chooseBtn.addEventListener("click", function () {
            fileInput.click();
        });

        clearBtn.addEventListener("click", function () {

            urlInput.value = "";

            refresh();

            setStatus("", "");

        });

        fileInput.addEventListener("change", async function () {

            const file = fileInput.files && fileInput.files[0];

            fileInput.value = "";

            if (!file) return;

            if (!file.type.startsWith("image/")) {
                setStatus("error", "Please choose an image file.");
                return;
            }

            if (file.size > MAX_ORIGINAL_SIZE) {
                setStatus("error", "This image is too large. Choose one under 25 MB.");
                return;
            }

            setBusy(true);

            setStatus("", "Uploading...");

            try {

                urlInput.value = await uploadImage(file, folder);

                refresh();

                setStatus("success", "Image uploaded. Press Add / Update to save.");

            } catch (error) {

                setStatus("error", error.message || "Upload failed.");

            }

            setBusy(false);

        });

        /* form reset hone par preview bhi saaf */

        form.addEventListener("reset", function () {

            setTimeout(function () {

                refresh();

                setStatus("", "");

            }, 0);

        });

        refresh();

    }


    /* =========================
       STAFF
    ========================= */

    const roleNames = {
        founder: "Founder",
        owner: "Owner",
        administrator: "Administrator",
        manager: "Manager",
        moderator: "Moderator",
        helper: "Helper",
        staff: "Staff",
        support: "Support"
    };

    let staffManager = null;
    let storeManager = null;
    let categoryManager = null;
    let ruleManager = null;
    let formManager = null;
    let fieldManager = null;
    let selectedForm = null;

    /* =========================
       SITE SETTINGS (rules header + logo)
    ========================= */

    async function saveSettings(rows) {

        return client
            .from("site_settings")
            .upsert(rows, { onConflict: "key" })
            .select();

    }

    async function loadSettings() {

        const result = await client.from("site_settings").select("key,value");

        if (result.error) {
            notify("error", "Could not load settings: " + errorText(result.error));
            return;
        }

        const values = {};

        result.data.forEach(function (row) {
            values[row.key] = row.value;
        });

        ["rules_tag", "rules_title", "rules_intro"].forEach(function (key) {

            const input = document.getElementById("rulesHeaderForm").elements[key];

            input.value = values[key] === undefined || values[key] === null ? "" : values[key];

        });

        const logoInput = document.getElementById("logoForm").elements.logo_url;

        logoInput.value = values.logo_url || "";

        logoInput.dispatchEvent(new Event("input", { bubbles: true }));

        const logoStatus = document.querySelector("#logoForm .admin-image-status");

        if (!values.logo_url) {
            logoStatus.className = "admin-image-status";
            logoStatus.textContent = "Currently using the default logo.";
        }

        document.getElementById("serverForm").elements.server_ip.value = values.server_ip || "";
        document.getElementById("serverForm").elements.bedrock_port.value = values.bedrock_port || "";

        const socialForm = document.getElementById("socialForm");

        socialForm.elements.discord_url.value = values.discord_url || "";
        socialForm.elements.youtube_url.value = values.youtube_url || "";

        const paymentForm = document.getElementById("paymentForm");

        ["payment_upi_id", "payment_note", "payment_qr_url"].forEach(function (key) {

            const input = paymentForm.elements[key];

            input.value = values[key] === undefined || values[key] === null ? "" : values[key];

            input.dispatchEvent(new Event("input", { bubbles: true }));

        });

    }

    function setupSettingsForms() {

        const headerForm = document.getElementById("rulesHeaderForm");

        headerForm.addEventListener("submit", async function (event) {

            event.preventDefault();

            const button = headerForm.querySelector('[type="submit"]');

            button.disabled = true;

            const rows = ["rules_tag", "rules_title", "rules_intro"].map(function (key) {
                return { key: key, value: headerForm.elements[key].value.trim() };
            });

            const result = await saveSettings(rows);

            button.disabled = false;

            if (result.error) {
                notify("error", errorText(result.error));
                return;
            }

            if (!result.data || result.data.length !== rows.length) {
                notify("error", "Not allowed. Please log in again.");
                return;
            }

            notify("success", "Rules header saved.");

        });

        const logoForm = document.getElementById("logoForm");

        logoForm.addEventListener("submit", async function (event) {

            event.preventDefault();

            const button = logoForm.querySelector('[type="submit"]');

            const url = logoForm.elements.logo_url.value.trim();

            button.disabled = true;

            let result;

            if (url) {

                result = await saveSettings([{ key: "logo_url", value: url }]);

                if (!result.error && (!result.data || result.data.length === 0)) {
                    result = { error: { message: "Not allowed. Please log in again." } };
                }

            } else {

                /* khali = default logo par wapas */

                result = await client
                    .from("site_settings")
                    .delete()
                    .eq("key", "logo_url")
                    .select();

            }

            button.disabled = false;

            if (result.error) {
                notify("error", errorText(result.error));
                return;
            }

            notify("success", url ? "Logo saved." : "Default logo restored.");

        });

        const socialForm = document.getElementById("socialForm");

        socialForm.addEventListener("submit", async function (event) {

            event.preventDefault();

            const button = socialForm.querySelector('[type="submit"]');

            const keys = ["discord_url", "youtube_url"];

            const values = {};

            for (let index = 0; index < keys.length; index++) {

                const value = socialForm.elements[keys[index]].value.trim();

                if (value && !/^https:\/\/[^\s]{4,190}$/i.test(value)) {
                    notify("error", "Links must start with https:// (example: https://discord.gg/xxxxxx).");
                    return;
                }

                values[keys[index]] = value;

            }

            button.disabled = true;

            const toSave = keys
                .filter(function (key) { return values[key] !== ""; })
                .map(function (key) { return { key: key, value: values[key] }; });

            const toRemove = keys.filter(function (key) { return values[key] === ""; });

            let failed = false;

            if (toSave.length > 0) {

                const saved = await saveSettings(toSave);

                if (saved.error || !saved.data || saved.data.length !== toSave.length) failed = true;

            }

            if (!failed && toRemove.length > 0) {

                const removed = await client
                    .from("site_settings")
                    .delete()
                    .in("key", toRemove)
                    .select();

                if (removed.error) failed = true;

            }

            button.disabled = false;

            if (failed) {
                notify("error", "Could not save. Please log in again and retry.");
                return;
            }

            notify("success", "Social links saved.");

        });

        const serverForm = document.getElementById("serverForm");

        serverForm.addEventListener("submit", async function (event) {

            event.preventDefault();

            const button = serverForm.querySelector('[type="submit"]');

            const address = serverForm.elements.server_ip.value.trim();
            const port = serverForm.elements.bedrock_port.value.trim();

            if (address && !/^[A-Za-z0-9]([A-Za-z0-9.-]{0,98}[A-Za-z0-9])?(:[0-9]{1,5})?$/.test(address)) {
                notify("error", "Enter a valid server address (example: play.example.com or 123.45.67.89).");
                return;
            }

            if (port && (!/^[0-9]{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535)) {
                notify("error", "Enter a valid Bedrock port (a number from 1 to 65535, usually 19132).");
                return;
            }

            button.disabled = true;

            const toSave = [];
            const toRemove = [];

            (address ? toSave : toRemove).push(address ? { key: "server_ip", value: address } : "server_ip");
            (port ? toSave : toRemove).push(port ? { key: "bedrock_port", value: port } : "bedrock_port");

            let result = { error: null };

            if (toSave.length) {

                result = await saveSettings(toSave);

                if (!result.error && (!result.data || result.data.length === 0)) {
                    result = { error: { message: "Not allowed. Please log in again." } };
                }

            }

            if (!result.error && toRemove.length) {

                result = await client
                    .from("site_settings")
                    .delete()
                    .in("key", toRemove)
                    .select();

            }

            button.disabled = false;

            if (result.error) {
                notify("error", errorText(result.error));
                return;
            }

            notify("success", address || port ? "Server address saved." : "Server address removed.");

        });

        const paymentForm = document.getElementById("paymentForm");

        paymentForm.addEventListener("submit", async function (event) {

            event.preventDefault();

            const button = paymentForm.querySelector('[type="submit"]');

            const upi = paymentForm.elements.payment_upi_id.value.trim();

            if (upi && !/^[A-Za-z0-9._-]{2,100}@[A-Za-z][A-Za-z0-9.-]{1,60}$/.test(upi)) {
                notify("error", "Enter a valid UPI ID (example: name@bank).");
                return;
            }

            button.disabled = true;

            const rows = ["payment_upi_id", "payment_note", "payment_qr_url"].map(function (key) {
                return { key: key, value: paymentForm.elements[key].value.trim() };
            });

            const result = await saveSettings(rows);

            button.disabled = false;

            if (result.error) {
                notify("error", errorText(result.error));
                return;
            }

            if (!result.data || result.data.length !== rows.length) {
                notify("error", "Not allowed. Please log in again.");
                return;
            }

            notify("success", "Payment details saved.");

        });

        loadSettings();

    }


    function fillCategorySelect(categories) {

        const select = document.getElementById("ruleCategorySelect");

        const current = select.value;

        select.textContent = "";

        const placeholder = document.createElement("option");

        placeholder.value = "";
        placeholder.textContent = categories.length === 0
            ? "Add a category first"
            : "Select category";

        select.appendChild(placeholder);

        categories.forEach(function (category) {

            const option = document.createElement("option");

            option.value = category.id;
            option.textContent = category.title;

            select.appendChild(option);

        });

        select.value = current;

    }


    /* =========================
       FORMS (apply forms banana + responses dekhna)
    ========================= */

    const typeNames = {
        text: "Short text",
        textarea: "Long text",
        email: "Email",
        number: "Number",
        select: "Dropdown",
        radio: "Multiple choice",
        checkbox: "Checkbox"
    };

    function slugify(text) {

        return text
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 60);

    }

    function smallButton(text, handler) {

        const button = el("button", "admin-btn small secondary", text);

        button.type = "button";

        button.addEventListener("click", handler);

        return button;

    }

    function closeDetail() {

        selectedForm = null;

        document.getElementById("formDetail").hidden = true;

    }

    function openDetail(form, target) {

        selectedForm = form;

        document.getElementById("formDetailTitle").textContent = form.title;

        document.getElementById("formDetail").hidden = false;

        fieldManager.reset();
        fieldManager.load();

        loadResponses();

        document
            .getElementById(target === "responses" ? "responsesCard" : "fieldFormCard")
            .scrollIntoView({ behavior: "smooth", block: "start" });

    }

    async function loadResponses() {

        const form = selectedForm;

        const list = document.getElementById("responseRows");
        const count = document.getElementById("responseCount");

        count.textContent = "";

        list.textContent = "";

        list.appendChild(el("p", "admin-empty", "Loading..."));

        const result = await client
            .from("form_submissions")
            .select("*")
            .eq("form_id", form.id)
            .order("created_at", { ascending: false })
            .limit(200);

        if (selectedForm !== form) return;

        list.textContent = "";

        if (result.error) {
            list.appendChild(el("p", "admin-empty", "Could not load: " + errorText(result.error)));
            return;
        }

        if (result.data.length === 0) {
            list.appendChild(el("p", "admin-empty", "No responses yet."));
            return;
        }

        count.textContent = "(" + result.data.length + ")";

        result.data.forEach(function (row) {
            list.appendChild(renderResponse(row));
        });

    }

    function renderResponse(row) {

        const card = el("div", "admin-response");

        const head = el("div", "admin-response-head");

        head.appendChild(el("span", "admin-row-name", row.submitter_username || "Guest"));

        if (row.submitter_email) {
            head.appendChild(el("span", "admin-meta", row.submitter_email));
        }

        head.appendChild(el("span", "admin-meta", new Date(row.created_at).toLocaleString()));

        const badge = el("span", "admin-badge", row.status);

        if (row.status === "accepted") badge.classList.add("ok");
        if (row.status === "rejected") badge.classList.add("muted");

        head.appendChild(badge);

        card.appendChild(head);

        (Array.isArray(row.answers) ? row.answers : []).forEach(function (answer) {

            const item = el("div", "admin-answer");

            item.appendChild(el("strong", "", answer.label));
            item.appendChild(el("p", "", String(answer.value)));

            card.appendChild(item);

        });

        const actions = el("div", "admin-response-actions");

        const select = document.createElement("select");

        ["new", "accepted", "rejected"].forEach(function (status) {

            const option = el("option", "", status.charAt(0).toUpperCase() + status.slice(1));

            option.value = status;

            select.appendChild(option);

        });

        select.value = row.status;

        select.addEventListener("change", async function () {

            const result = await client
                .from("form_submissions")
                .update({ status: select.value })
                .eq("id", row.id)
                .select();

            if (result.error || !result.data || result.data.length === 0) {
                notify("error", result.error ? errorText(result.error) : "Not allowed. Please log in again.");
                select.value = row.status;
                return;
            }

            notify("success", "Status updated.");

            loadResponses();

        });

        const deleteBtn = el("button", "admin-btn small danger", "Delete");

        deleteBtn.type = "button";

        deleteBtn.addEventListener("click", async function () {

            if (!window.confirm("Delete this response?")) return;

            const result = await client
                .from("form_submissions")
                .delete()
                .eq("id", row.id)
                .select();

            if (result.error || !result.data || result.data.length === 0) {
                notify("error", result.error ? errorText(result.error) : "Not allowed. Please log in again.");
                return;
            }

            notify("success", "Response deleted.");

            loadResponses();

        });

        actions.appendChild(select);
        actions.appendChild(deleteBtn);

        card.appendChild(actions);

        return card;

    }

    function setupForms() {

        formManager = createManager({
            table: "forms",
            formId: "formForm",
            listId: "formRows",
            titleId: "formFormTitle",
            addTitle: "Create form",
            editTitle: "Edit form",
            secondOrder: "created_at",
            fields: [
                { name: "title", type: "text" },
                { name: "slug", type: "text" },
                { name: "description", type: "text" },
                { name: "sort_order", type: "number" },
                { name: "is_open", type: "checkbox" },
                { name: "require_login", type: "checkbox" }
            ],
            label: function (row) { return row.title; },
            confirmText: function (row) {
                return 'Delete form "' + row.title + '" with ALL its questions and responses?';
            },
            beforeSave: function (payload) {
                if (!payload.slug) payload.slug = slugify(payload.title || "");
            },
            validate: function (payload) {
                if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(payload.slug || "")) {
                    return "Link name must use letters or numbers (for example: staff-apply).";
                }
                return null;
            },
            afterChange: closeDetail,
            extraActions: function (row) {
                return [
                    smallButton("Questions", function () { openDetail(row, "fields"); }),
                    smallButton("Responses", function () { openDetail(row, "responses"); })
                ];
            },
            renderMain: function (row, make) {

                const main = make("div", "admin-row-main");

                main.appendChild(make("span", "admin-row-name", row.title));
                main.appendChild(make("span", row.is_open ? "admin-badge ok" : "admin-badge muted", row.is_open ? "Open" : "Closed"));
                main.appendChild(make("span", "admin-meta", row.require_login ? "Login required" : "Anyone can apply"));
                main.appendChild(make("span", "admin-meta", "form.html?f=" + row.slug));

                return main;

            }
        });

        fieldManager = createManager({
            table: "form_fields",
            formId: "fieldForm",
            listId: "fieldRows",
            titleId: "fieldFormTitle",
            addTitle: "Add question",
            editTitle: "Edit question",
            fields: [
                { name: "label", type: "text" },
                { name: "field_type", type: "text" },
                { name: "options", type: "text" },
                { name: "sort_order", type: "number" },
                { name: "is_required", type: "checkbox" }
            ],
            label: function (row) { return row.label; },
            extraPayload: function () { return { form_id: selectedForm.id }; },
            validate: function (payload) {

                const needsOptions = payload.field_type === "select" || payload.field_type === "radio";

                if (needsOptions && !payload.options) {
                    return "Add at least one option (one per line).";
                }

                return null;

            },
            query: async function () {

                return client
                    .from("form_fields")
                    .select("*")
                    .eq("form_id", selectedForm ? selectedForm.id : "00000000-0000-0000-0000-000000000000")
                    .order("sort_order", { ascending: true })
                    .order("created_at", { ascending: true });

            },
            renderMain: function (row, make) {

                const main = make("div", "admin-row-main");

                main.appendChild(make("span", "admin-row-name", row.label));
                main.appendChild(make("span", "admin-badge", typeNames[row.field_type] || row.field_type));

                if (row.is_required) {
                    main.appendChild(make("span", "admin-badge muted", "Required"));
                }

                main.appendChild(make("span", "admin-meta", "Order " + row.sort_order));

                if (row.options) {
                    main.appendChild(make("span", "admin-meta admin-row-desc", row.options.split("\n").join(" • ")));
                }

                return main;

            }
        });

        document.getElementById("formDetailClose").addEventListener("click", closeDetail);

    }


    /* =========================
       STORE GALLERY (product preview ki images)
    ========================= */

    let galleryItem = null;

    function closeGallery() {

        galleryItem = null;

        document.getElementById("galleryDetail").hidden = true;

    }

    async function loadGallery() {

        const item = galleryItem;

        const grid = document.getElementById("galleryGrid");

        grid.textContent = "";

        const result = await client
            .from("store_item_images")
            .select("*")
            .eq("item_id", item.id)
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: true });

        if (galleryItem !== item) return;

        if (result.error) {
            grid.appendChild(el("p", "admin-empty", "Could not load: " + errorText(result.error)));
            return;
        }

        if (result.data.length === 0) {
            grid.appendChild(el("p", "admin-empty", "No gallery images yet."));
            return;
        }

        result.data.forEach(function (row) {

            const box = el("div", "admin-gallery-item");

            const image = document.createElement("img");

            image.src = row.image_url;
            image.alt = "Gallery image";

            const remove = el("button", "", "✕");

            remove.type = "button";
            remove.setAttribute("aria-label", "Delete image");

            remove.addEventListener("click", async function () {

                if (!window.confirm("Remove this image from the gallery?")) return;

                const deleted = await client
                    .from("store_item_images")
                    .delete()
                    .eq("id", row.id)
                    .select();

                if (deleted.error || !deleted.data || deleted.data.length === 0) {
                    notify("error", deleted.error ? errorText(deleted.error) : "Not allowed. Please log in again.");
                    return;
                }

                notify("success", "Image removed.");

                loadGallery();

            });

            box.appendChild(image);
            box.appendChild(remove);

            grid.appendChild(box);

        });

    }

    function openGallery(row) {

        galleryItem = row;

        document.getElementById("galleryItemName").textContent = row.name;

        const status = document.getElementById("galleryStatus");

        status.className = "admin-image-status";
        status.textContent = "";

        document.getElementById("galleryDetail").hidden = false;

        loadGallery();

        document.getElementById("galleryDetail").scrollIntoView({ behavior: "smooth", block: "start" });

    }

    function setupGallery() {

        const fileInput = document.getElementById("galleryFile");
        const addBtn = document.getElementById("galleryAdd");
        const status = document.getElementById("galleryStatus");

        function setStatus(type, message) {

            status.className = "admin-image-status" + (type ? " " + type : "");

            status.textContent = message;

        }

        addBtn.addEventListener("click", function () { fileInput.click(); });

        document.getElementById("galleryClose").addEventListener("click", closeGallery);

        fileInput.addEventListener("change", async function () {

            const item = galleryItem;

            const files = Array.prototype.slice.call(fileInput.files || []);

            fileInput.value = "";

            if (!item || files.length === 0) return;

            addBtn.disabled = true;

            const existing = document.querySelectorAll("#galleryGrid .admin-gallery-item").length;

            let added = 0;
            let failed = 0;

            for (let index = 0; index < files.length; index++) {

                const file = files[index];

                setStatus("", "Uploading " + (index + 1) + " of " + files.length + "...");

                if (!file.type.startsWith("image/") || file.size > MAX_ORIGINAL_SIZE) {
                    failed++;
                    continue;
                }

                try {

                    const url = await uploadImage(file, "store-gallery");

                    const saved = await client
                        .from("store_item_images")
                        .insert({ item_id: item.id, image_url: url, sort_order: existing + added })
                        .select();

                    if (saved.error || !saved.data || saved.data.length === 0) {
                        failed++;
                    } else {
                        added++;
                    }

                } catch (error) {

                    failed++;

                }

            }

            addBtn.disabled = false;

            if (failed > 0) {
                setStatus("error", added + " added, " + failed + " failed. Use PNG, JPG, WEBP or GIF under 25 MB.");
            } else {
                setStatus("success", added + (added === 1 ? " image added." : " images added."));
            }

            if (galleryItem === item) loadGallery();

        });

    }


    /* =========================
       ORDERS (payment proof dekh ke approve / reject)
    ========================= */

    const PROOF_BUCKET = "payment-proofs";

    function moneyText(value) {

        const number = Number(value);

        return window.spark.config.currency + (Number.isInteger(number) ? number : number.toFixed(2));

    }

    async function refreshPendingCount() {

        const result = await client
            .from("orders")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending");

        const label = document.getElementById("ordersTabLabel");

        label.textContent = result.count > 0 ? "Orders (" + result.count + ")" : "Orders";

    }

    function openLightbox(url) {

        const box = el("div", "admin-lightbox");

        const image = document.createElement("img");

        image.src = url;
        image.alt = "Payment screenshot";

        box.appendChild(image);

        box.addEventListener("click", function () { box.remove(); });

        document.body.appendChild(box);

    }

    async function setOrderStatus(order, status, note) {

        const payload = { status: status, admin_note: note || null };

        const result = await client
            .from("orders")
            .update(payload)
            .eq("id", order.id)
            .select();

        if (result.error) {

            notify(
                "error",
                result.error.code === "23505"
                    ? "Another active order already uses this UTR."
                    : errorText(result.error)
            );

            return;

        }

        if (!result.data || result.data.length === 0) {
            notify("error", "Not allowed. Please log in again.");
            return;
        }

        notify("success", status === "approved" ? "Order approved." : "Order rejected.");

        loadOrders();

        refreshPendingCount();

        loadDashboard();

    }

    function renderOrder(order, proofUrl) {

        const card = el("div", "admin-response");

        const head = el("div", "admin-response-head");

        const orderItems = (order.order_items || []).slice().sort(function (a, b) {
            return String(a.item_name).localeCompare(String(b.item_name));
        });

        const headline = orderItems.length === 0
            ? "Order"
            : orderItems[0].item_name + " × " + orderItems[0].quantity +
              (orderItems.length > 1 ? "  + " + (orderItems.length - 1) + " more" : "");

        head.appendChild(el("span", "admin-row-name", headline));
        head.appendChild(el("span", "admin-badge", moneyText(order.total)));

        const badge = el("span", "admin-badge", order.status);

        if (order.status === "approved") badge.classList.add("ok");
        if (order.status === "rejected") badge.classList.add("muted");

        head.appendChild(badge);
        head.appendChild(el("span", "admin-meta", new Date(order.created_at).toLocaleString()));

        card.appendChild(head);

        const body = el("div", "admin-order-body");

        const proof = el("div", "admin-order-proof");

        if (proofUrl) {

            const image = document.createElement("img");

            image.src = proofUrl;
            image.alt = "Payment screenshot";

            proof.appendChild(image);

            proof.addEventListener("click", function () { openLightbox(proofUrl); });

        } else {

            proof.textContent = "Screenshot not available";

        }

        body.appendChild(proof);

        const info = el("div", "admin-order-info");

        function line(label, value) {

            const paragraph = document.createElement("p");

            paragraph.appendChild(el("span", "", label + ": "));
            paragraph.appendChild(el("strong", "", value));

            info.appendChild(paragraph);

        }

        line("Minecraft name", order.minecraft_username);
        line("UTR", order.utr);
        line("Buyer", (order.submitter_username || "Unknown") +
            (order.submitter_email ? " (" + order.submitter_email + ")" : ""));
        orderItems.forEach(function (item) {
            line("Item", item.item_name + " × " + item.quantity + " — " + moneyText(item.line_total));
        });

        if (Number(order.discount) > 0) {

            line("Subtotal", moneyText(order.subtotal));
            line("Discount", "−" + moneyText(order.discount) +
                (order.coupon_code ? " (" + order.coupon_code + ")" : ""));

        }

        line("Total to verify", moneyText(order.total));

        if (order.admin_note) line("Note", order.admin_note);

        body.appendChild(info);

        card.appendChild(body);

        const actions = el("div", "admin-response-actions");

        if (order.status !== "approved") {

            const approve = el("button", "admin-btn small success", "Approve");

            approve.type = "button";

            approve.addEventListener("click", function () {

                if (window.confirm("Approve this order? Check the screenshot and amount first.")) {
                    setOrderStatus(order, "approved", null);
                }

            });

            actions.appendChild(approve);

        }

        if (order.status !== "rejected") {

            const reject = el("button", "admin-btn small danger", "Reject");

            reject.type = "button";

            reject.addEventListener("click", function () {

                const note = window.prompt("Reason for rejecting (the user will see this):", "");

                if (note === null) return;

                setOrderStatus(order, "rejected", note.trim());

            });

            actions.appendChild(reject);

        }

        card.appendChild(actions);

        return card;

    }

    async function loadOrders() {

        const list = document.getElementById("orderRows");

        const filter = document.getElementById("orderFilter").value;

        list.textContent = "";

        list.appendChild(el("p", "admin-empty", "Loading..."));

        let query = client
            .from("orders")
            .select("*, order_items(*)")
            .order("created_at", { ascending: false })
            .limit(100);

        if (filter !== "all") query = query.eq("status", filter);

        const result = await query;

        if (document.getElementById("orderFilter").value !== filter) return;

        list.textContent = "";

        if (result.error) {
            list.appendChild(el("p", "admin-empty", "Could not load: " + errorText(result.error)));
            return;
        }

        if (result.data.length === 0) {
            list.appendChild(el("p", "admin-empty", "No " + (filter === "all" ? "" : filter + " ") + "orders."));
            return;
        }

        /* screenshots private bucket mein hain - 1 ghante ke signed links */

        const urls = {};

        const signed = await client.storage
            .from(PROOF_BUCKET)
            .createSignedUrls(result.data.map(function (order) { return order.screenshot_path; }), 3600);

        if (signed.data) {

            signed.data.forEach(function (item) {
                if (item.signedUrl) urls[item.path] = item.signedUrl;
            });

        }

        result.data.forEach(function (order) {
            list.appendChild(renderOrder(order, urls[order.screenshot_path]));
        });

    }

    function setupOrders() {

        document.getElementById("orderFilter").addEventListener("change", loadOrders);

        loadOrders();

        refreshPendingCount();

    }


    /* =========================
       DISCORD NOTIFICATIONS (order aane par channel mein message)
       Webhook URL database mein secret rehta hai - yahan se dobara padha nahi ja sakta.
    ========================= */

    async function refreshDiscordStatus() {

        const status = document.getElementById("discordStatus");

        const testBtn = document.getElementById("discordTest");
        const clearBtn = document.getElementById("discordClear");

        status.textContent = "";

        const result = await client.rpc("discord_status");

        if (result.error) {

            status.appendChild(el("span", "admin-badge muted", "Could not check"));

            return;

        }

        const connected = result.data === true;

        status.appendChild(el(
            "span",
            connected ? "admin-badge ok" : "admin-badge muted",
            connected ? "Connected" : "Not connected"
        ));

        status.appendChild(el(
            "span",
            "admin-meta",
            connected
                ? "New orders will be posted to your Discord channel."
                : "Paste a webhook URL below to turn on notifications."
        ));

        testBtn.hidden = !connected;
        clearBtn.hidden = !connected;

    }

    function discordErrorText(error) {

        const text = (error.message || "").toLowerCase();

        if (text.includes("not a valid discord webhook")) {
            return "That is not a valid Discord webhook URL. It should start with https://discord.com/api/webhooks/";
        }

        if (text.includes("not allowed")) return "Not allowed. Please log in again.";

        return errorText(error);

    }

    function setupDiscord() {

        const form = document.getElementById("discordForm");

        const input = form.elements.webhook;
        const saveBtn = form.querySelector('[type="submit"]');
        const testBtn = document.getElementById("discordTest");
        const clearBtn = document.getElementById("discordClear");

        form.addEventListener("submit", async function (event) {

            event.preventDefault();

            const url = input.value.trim();

            if (!url) {
                notify("error", "Paste the webhook URL first.");
                return;
            }

            saveBtn.disabled = true;

            const result = await client.rpc("set_discord_webhook", { p_url: url });

            saveBtn.disabled = false;

            if (result.error) {
                notify("error", discordErrorText(result.error));
                return;
            }

            input.value = "";

            notify("success", "Webhook saved. Press \"Send test message\" to check it.");

            refreshDiscordStatus();

        });

        testBtn.addEventListener("click", async function () {

            testBtn.disabled = true;

            const sent = await client.rpc("send_discord_test");

            if (sent.error) {

                testBtn.disabled = false;

                notify("error", discordErrorText(sent.error));

                return;

            }

            /* Discord ka jawab aane tak thoda ruk kar check karo */

            let outcome = null;

            for (let attempt = 0; attempt < 8; attempt++) {

                await new Promise(function (resolve) { setTimeout(resolve, 1000); });

                const check = await client.rpc("discord_test_result", { p_request_id: sent.data });

                if (check.data && check.data.done) {
                    outcome = check.data;
                    break;
                }

            }

            testBtn.disabled = false;

            if (!outcome) {
                notify("error", "No answer from Discord yet. Check your channel in a moment.");
                return;
            }

            if (outcome.status >= 200 && outcome.status < 300) {
                notify("success", "Test message sent! Check your Discord channel.");
            } else if (outcome.status === 404 || outcome.status === 401) {
                notify("error", "Discord says this webhook does not exist. Create a new webhook and save it again.");
            } else {
                notify("error", "Discord returned an error (" + (outcome.status || outcome.error) + ").");
            }

        });

        clearBtn.addEventListener("click", async function () {

            if (!window.confirm("Disconnect Discord? New orders will no longer be posted.")) return;

            const result = await client.rpc("clear_discord_webhook");

            if (result.error) {
                notify("error", discordErrorText(result.error));
                return;
            }

            notify("success", "Discord disconnected.");

            refreshDiscordStatus();

        });

        refreshDiscordStatus();

    }


    /* =========================
       SALES DASHBOARD
    ========================= */

    let dashToken = 0;

    function dayLabel(day) {

        return new Date(day + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });

    }

    async function loadDashboard() {

        const range = document.getElementById("dashRange");
        const statsBox = document.getElementById("dashStats");
        const chart = document.getElementById("dashChart");
        const axis = document.getElementById("dashAxis");
        const topBox = document.getElementById("dashTop");
        const couponBox = document.getElementById("dashCoupons");

        const token = ++dashToken;

        const days = Number(range.value);

        const zone = (Intl.DateTimeFormat().resolvedOptions().timeZone) || "UTC";

        const result = await client.rpc("sales_summary", { p_days: days, p_tz: zone });

        if (token !== dashToken) return;

        [statsBox, chart, axis, topBox, couponBox].forEach(function (box) { box.textContent = ""; });

        if (result.error) {
            statsBox.appendChild(el("p", "admin-empty", "Could not load: " + errorText(result.error)));
            return;
        }

        const data = result.data;

        function stat(label, value, note, accent) {

            const card = el("div", "dash-stat" + (accent ? " accent" : ""));

            card.appendChild(el("span", "", label));
            card.appendChild(el("strong", "", value));

            if (note) card.appendChild(el("small", "", note));

            statsBox.appendChild(card);

        }

        const periodNote = "Last " + data.days + " days";

        stat("Revenue", moneyText(data.revenue), periodNote, true);
        stat("Approved orders", String(data.orders), periodNote);
        stat("Average order", moneyText(data.avg_order), periodNote);
        stat("Discounts given", moneyText(data.discounts), periodNote);
        stat("Pending payments", String(data.pending_count), moneyText(data.pending_amount) + " waiting for review");
        stat("Lifetime revenue", moneyText(data.lifetime_revenue), data.lifetime_orders + " approved orders");
        stat("Rejected orders", String(data.rejected), "of " + data.placed + " placed in this period");

        /* bar chart */

        const daily = data.daily || [];

        const highest = daily.reduce(function (max, day) { return Math.max(max, Number(day.revenue)); }, 0);

        daily.forEach(function (day) {

            const bar = el("div", "dash-bar" + (Number(day.revenue) === 0 ? " zero" : ""));

            bar.style.height = highest > 0
                ? Math.max(2, Math.round((Number(day.revenue) / highest) * 100)) + "%"
                : "2%";

            const text = dayLabel(day.day) + ": " + moneyText(day.revenue) +
                " (" + day.orders + (day.orders === 1 ? " order)" : " orders)");

            bar.title = text;
            bar.setAttribute("aria-label", text);

            chart.appendChild(bar);

        });

        if (daily.length > 0) {

            axis.appendChild(el("span", "", dayLabel(daily[0].day)));
            axis.appendChild(el("span", "", "Peak day: " + moneyText(highest)));
            axis.appendChild(el("span", "", dayLabel(daily[daily.length - 1].day)));

        }

        if (highest === 0) {
            axis.parentNode.appendChild(el("p", "dash-empty", "No approved sales in this period yet."));
        } else {

            const old = axis.parentNode.querySelector(".dash-empty");

            if (old) old.remove();

        }

        /* top products */

        if ((data.top_items || []).length === 0) {

            topBox.appendChild(el("p", "admin-empty", "No sales yet."));

        } else {

            data.top_items.forEach(function (item, index) {

                const row = el("div", "admin-row");

                const main = el("div", "admin-row-main");

                main.appendChild(el("span", "admin-meta", "#" + (index + 1)));
                main.appendChild(el("span", "admin-row-name", item.name));
                main.appendChild(el("span", "admin-badge", item.qty + " sold"));

                row.appendChild(main);
                row.appendChild(el("strong", "", moneyText(item.revenue)));

                topBox.appendChild(row);

            });

        }

        /* coupons used */

        if ((data.coupons || []).length === 0) {

            couponBox.appendChild(el("p", "admin-empty", "No coupons used in this period."));

        } else {

            data.coupons.forEach(function (coupon) {

                const row = el("div", "admin-row");

                const main = el("div", "admin-row-main");

                main.appendChild(el("span", "admin-row-name", coupon.code));
                main.appendChild(el("span", "admin-badge", coupon.uses + (coupon.uses === 1 ? " use" : " uses")));

                row.appendChild(main);
                row.appendChild(el("span", "admin-meta", "Discount given: " + moneyText(coupon.discount)));

                couponBox.appendChild(row);

            });

        }

    }


    /* =========================
       COUPONS
    ========================= */

    let couponManager = null;

    function setupCoupons() {

        document.getElementById("dashRange").addEventListener("change", loadDashboard);

        couponManager = createManager({
            table: "coupons",
            formId: "couponForm",
            listId: "couponRows",
            titleId: "couponFormTitle",
            addTitle: "Create coupon",
            editTitle: "Edit coupon",
            fields: [
                { name: "code", type: "text" },
                { name: "discount_type", type: "text" },
                { name: "value", type: "number" },
                { name: "min_order", type: "number" },
                { name: "max_discount", type: "nullable_number" },
                { name: "max_uses", type: "nullable_number" },
                { name: "per_user_limit", type: "number" },
                { name: "expires_on", type: "text" },
                { name: "is_active", type: "checkbox" }
            ],
            label: function (row) { return row.code; },
            beforeSave: function (payload) {
                payload.code = String(payload.code || "").toUpperCase().replace(/\s+/g, "");
            },
            validate: function (payload) {

                if (!/^[A-Z0-9_-]{3,20}$/.test(payload.code)) {
                    return "Coupon code must be 3-20 letters, numbers, - or _.";
                }

                if (!(payload.value > 0)) return "Discount value must be more than 0.";

                if (payload.discount_type === "percent" && payload.value > 100) {
                    return "A percent discount cannot be more than 100.";
                }

                if (!(payload.per_user_limit >= 1)) return "Uses per user must be at least 1.";

                return null;

            },
            query: async function () {

                const result = await client
                    .from("coupons")
                    .select("*")
                    .order("created_at", { ascending: false });

                if (result.error) return result;

                const counts = await client.rpc("coupon_use_counts");

                const map = {};

                (counts.data || []).forEach(function (item) { map[item.code] = item.uses; });

                result.data.forEach(function (row) { row.uses = map[row.code] || 0; });

                return result;

            },
            renderMain: function (row, make) {

                const main = make("div", "admin-row-main");

                main.appendChild(make("span", "admin-row-name", row.code));

                main.appendChild(make(
                    "span",
                    "admin-badge",
                    row.discount_type === "percent"
                        ? Number(row.value) + "% off"
                        : moneyText(row.value) + " off"
                ));

                const today = new Date().toISOString().slice(0, 10);

                if (!row.is_active) {
                    main.appendChild(make("span", "admin-badge muted", "Inactive"));
                } else if (row.expires_on && row.expires_on < today) {
                    main.appendChild(make("span", "admin-badge muted", "Expired"));
                }

                const details = [];

                if (Number(row.min_order) > 0) details.push("Min order " + moneyText(row.min_order));
                if (row.max_discount !== null) details.push("Max discount " + moneyText(row.max_discount));

                details.push("Used " + row.uses + (row.max_uses !== null ? " / " + row.max_uses : ""));
                details.push(row.per_user_limit + " per user");

                if (row.expires_on) details.push("Expires " + row.expires_on);

                main.appendChild(make("span", "admin-meta admin-row-desc", details.join(" • ")));

                return main;

            }
        });

    }


    function setup() {

        document.querySelectorAll("[data-image-picker]").forEach(initImagePicker);

        staffManager = createManager({
            table: "staff",
            formId: "staffForm",
            listId: "staffRows",
            titleId: "staffFormTitle",
            addTitle: "Add staff member",
            editTitle: "Edit staff member",
            secondOrder: "player_name",
            fields: [
                { name: "player_name", type: "text" },
                { name: "role", type: "text" },
                { name: "skin_url", type: "text" },
                { name: "sort_order", type: "number" }
            ],
            label: function (row) { return row.player_name; },
            renderMain: function (row, make) {

                const main = make("div", "admin-row-main");

                main.appendChild(make("span", "admin-row-name", row.player_name));
                main.appendChild(make("span", "admin-badge", roleNames[row.role] || row.role));
                main.appendChild(make("span", "admin-meta", "Order " + row.sort_order));

                return main;

            }
        });

        storeManager = createManager({
            table: "store_items",
            formId: "storeForm",
            listId: "storeRows",
            titleId: "storeFormTitle",
            addTitle: "Add store item",
            editTitle: "Edit store item",
            secondOrder: "created_at",
            afterChange: function () { closeGallery(); },
            extraActions: function (row) {
                return [smallButton("Gallery", function () { openGallery(row); })];
            },
            fields: [
                { name: "name", type: "text" },
                { name: "price", type: "number" },
                { name: "category", type: "text" },
                { name: "sort_order", type: "number" },
                { name: "image_url", type: "text" },
                { name: "description", type: "text" },
                { name: "is_active", type: "checkbox" }
            ],
            label: function (row) { return row.name; },
            renderMain: function (row, make) {

                const main = make("div", "admin-row-main");

                main.appendChild(make("span", "admin-row-name", row.name));
                main.appendChild(make("span", "admin-meta", formatPrice(row.price)));

                if (row.category) {
                    main.appendChild(make("span", "admin-badge", row.category));
                }

                if (!row.is_active) {
                    main.appendChild(make("span", "admin-badge muted", "Hidden"));
                }

                return main;

            }
        });

        categoryManager = createManager({
            table: "rule_categories",
            formId: "categoryForm",
            listId: "categoryRows",
            titleId: "categoryFormTitle",
            addTitle: "Add rule category",
            editTitle: "Edit rule category",
            secondOrder: "created_at",
            fields: [
                { name: "title", type: "text" },
                { name: "description", type: "text" },
                { name: "sort_order", type: "number" }
            ],
            label: function (row) { return row.title; },
            confirmText: function (row) {
                return 'Delete category "' + row.title + '" and ALL rules inside it?';
            },
            onLoaded: fillCategorySelect,
            afterChange: function () { if (ruleManager) ruleManager.load(); },
            renderMain: function (row, make) {

                const main = make("div", "admin-row-main");

                main.appendChild(make("span", "admin-row-name", row.title));
                main.appendChild(make("span", "admin-meta", "Order " + row.sort_order));

                if (row.description) {
                    main.appendChild(make("span", "admin-meta admin-row-desc", row.description));
                }

                return main;

            }
        });

        ruleManager = createManager({
            table: "rules",
            formId: "ruleForm",
            listId: "ruleRows",
            titleId: "ruleFormTitle",
            addTitle: "Add rule",
            editTitle: "Edit rule",
            fields: [
                { name: "category_id", type: "text" },
                { name: "title", type: "text" },
                { name: "description", type: "text" },
                { name: "sort_order", type: "number" }
            ],
            label: function (row) { return row.title; },
            query: async function () {

                const result = await client
                    .from("rules")
                    .select("*, rule_categories(title, sort_order)");

                if (result.data) {

                    /* category ke order mein, phir rule ke order mein */

                    result.data.sort(function (a, b) {

                        const catA = a.rule_categories ? a.rule_categories.sort_order : 0;
                        const catB = b.rule_categories ? b.rule_categories.sort_order : 0;

                        if (catA !== catB) return catA - catB;

                        return a.sort_order - b.sort_order;

                    });

                }

                return result;

            },
            renderMain: function (row, make) {

                const main = make("div", "admin-row-main");

                main.appendChild(make("span", "admin-row-name", row.title));

                if (row.rule_categories) {
                    main.appendChild(make("span", "admin-badge", row.rule_categories.title));
                }

                main.appendChild(make("span", "admin-meta", "Order " + row.sort_order));

                if (row.description) {
                    main.appendChild(make("span", "admin-meta admin-row-desc", row.description));
                }

                return main;

            }
        });

        setupForms();

        setupGallery();

        setupOrders();

        setupDiscord();

        setupCoupons();

        setupSettingsForms();

    }


    /* =========================
       TABS
    ========================= */

    document.querySelectorAll(".admin-tab").forEach(function (tab) {

        tab.addEventListener("click", function () {

            document.querySelectorAll(".admin-tab").forEach(function (item) {
                item.classList.toggle("active", item === tab);
            });

            document.querySelectorAll(".admin-panel").forEach(function (panel) {
                panel.hidden = panel.id !== "panel-" + tab.dataset.tab;
            });

        });

    });


    /* =========================
       ACCESS CHECK
    ========================= */

    async function init() {

        if (!client) {
            showGate("Could not connect to the server. Please try again later.");
            return;
        }

        const sessionResult = await client.auth.getSession();

        if (!sessionResult.data.session) {
            showGate("Please log in to open the admin panel.", "Go to Login", "login.html");
            return;
        }

        const adminResult = await client.rpc("is_admin");

        if (adminResult.error || adminResult.data !== true) {
            showGate("Access denied. This page is only for admins.", "Back to Home", "index.html");
            return;
        }

        gate.hidden = true;
        app.hidden = false;

        setup();

        staffManager.load();
        storeManager.load();
        categoryManager.load();
        ruleManager.load();
        formManager.load();
        couponManager.load();
        loadDashboard();

    }

    init().catch(function () {
        showGate("Something went wrong. Please refresh the page.");
    });

});
