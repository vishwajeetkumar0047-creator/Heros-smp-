/* =====================================
   FORMS LIST PAGE JS
   Khule hue forms Supabase se aate hain
===================================== */

document.addEventListener("DOMContentLoaded", function () {

    const container = document.getElementById("formsList");

    if (!container || !window.spark) return;


    function make(tag, className, text) {

        const element = document.createElement(tag);

        if (className) element.className = className;

        if (text !== undefined && text !== null) element.textContent = text;

        return element;

    }

    function showMessage(text) {

        container.textContent = "";

        container.appendChild(make("p", "forms-status", text));

    }

    function render(forms) {

        if (forms.length === 0) {
            showMessage("No forms are open right now. Check back soon!");
            return;
        }

        container.textContent = "";

        const grid = make("div", "forms-grid");

        forms.forEach(function (form, index) {

            const card = make("article", "form-card");

            card.style.animationDelay = Math.min(index, 8) * 0.06 + "s";

            const icon = make("div", "form-card-icon");
            icon.appendChild(make("i", "fa-solid fa-clipboard-list"));

            card.appendChild(icon);
            card.appendChild(make("h2", "", form.title));

            if (form.description) {
                card.appendChild(make("p", "", form.description));
            }

            const link = make("a", "form-card-btn", "Apply now");

            link.href = "form.html?f=" + encodeURIComponent(form.slug);

            card.appendChild(link);

            grid.appendChild(card);

        });

        container.appendChild(grid);

    }


    window.spark
        .select(
            "forms",
            "select=slug,title,description&order=sort_order.asc,created_at.asc"
        )
        .then(render)
        .catch(function () {
            showMessage("Could not load the forms. Please try again later.");
        });

});
