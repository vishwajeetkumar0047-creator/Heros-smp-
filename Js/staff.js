/* =====================================
   STAFF PAGE JS
   Supabase ke "staff" table se list banata hai
===================================== */

document.addEventListener("DOMContentLoaded", function () {

    const container = document.getElementById("staffList");

    if (!container) return;


    /* Category order + naam */

    const categories = [
        { role: "founder",       title: "Founders",       label: "Founder" },
        { role: "owner",         title: "Owners",         label: "Owner" },
        { role: "administrator", title: "Administration", label: "Administrator" },
        { role: "manager",       title: "Management",     label: "Manager" },
        { role: "moderator",     title: "Moderation",     label: "Moderator" },
        { role: "helper",        title: "Helpers",        label: "Helper" },
        { role: "staff",         title: "Staff Team",     label: "Staff" },
        { role: "support",       title: "Support Team",   label: "Support Team" }
    ];


    function showMessage(text) {

        container.textContent = "";

        const message = document.createElement("p");

        message.className = "data-status";

        message.textContent = text;

        container.appendChild(message);

    }


    function createCard(member, label) {

        const card = document.createElement("div");
        card.className = "staff-card";

        const skin = document.createElement("div");
        skin.className = "staff-skin";

        /* Skin image nahi ho ya load na ho to gray box dikhega */

        if (member.skin_url) {

            const image = document.createElement("img");

            image.alt = member.player_name + " Skin";

            image.addEventListener("error", function () {
                image.style.display = "none";
            });

            image.src = member.skin_url;

            skin.appendChild(image);

        }

        const name = document.createElement("div");
        name.className = "staff-name";
        name.textContent = member.player_name;

        const role = document.createElement("div");
        role.className = "staff-role";
        role.textContent = label;

        card.appendChild(skin);
        card.appendChild(name);
        card.appendChild(role);

        return card;

    }


    function render(staff) {

        container.textContent = "";

        let number = 0;

        categories.forEach(function (category) {

            const members = staff.filter(function (member) {
                return member.role === category.role;
            });

            /* Khali category page par nahi dikhegi */

            if (members.length === 0) return;

            number++;

            const wrapper = document.createElement("div");
            wrapper.className = "staff-category";

            const title = document.createElement("h2");
            title.className = "category-title";

            const numberSpan = document.createElement("span");
            numberSpan.textContent = String(number).padStart(2, "0") + ".";

            title.appendChild(numberSpan);
            title.appendChild(document.createTextNode(" " + category.title));

            const grid = document.createElement("div");
            grid.className = "staff-grid";

            members.forEach(function (member) {
                grid.appendChild(createCard(member, category.label));
            });

            wrapper.appendChild(title);
            wrapper.appendChild(grid);

            container.appendChild(wrapper);

        });

        if (number === 0) {
            showMessage("No staff members added yet.");
        }

    }


    showMessage("Loading staff...");

    window.spark
        .select(
            "staff",
            "select=player_name,role,skin_url&order=sort_order.asc,player_name.asc"
        )
        .then(render)
        .catch(function () {
            showMessage("Could not load the staff list. Please try again later.");
        });

});
