/* =====================================
   RULES PAGE JS
   Rules Supabase se aate hain (admin panel se edit hote hain).
   Database na mile to HTML mein likhe hue rules hi dikhte rehte hain.
===================================== */

document.addEventListener("DOMContentLoaded", function () {

    const root = document.documentElement;
    const list = document.getElementById("rulesList");

    function reveal() {
        root.classList.remove("rules-pending");
    }

    if (!list || !window.spark) {
        reveal();
        return;
    }


    function make(tag, className, text) {

        const element = document.createElement(tag);

        if (className) element.className = className;

        if (text !== undefined && text !== null) element.textContent = text;

        return element;

    }

    function pad(number) {
        return String(number).padStart(2, "0");
    }


    function applySettings(settings) {

        const map = {
            rules_tag: "rulesTag",
            rules_title: "rulesTitle",
            rules_intro: "rulesIntro"
        };

        settings.forEach(function (item) {

            const id = map[item.key];

            const element = id ? document.getElementById(id) : null;

            if (element && item.value !== null) {
                element.textContent = item.value;
            }

        });

    }


    function render(categories, rules) {

        list.textContent = "";

        if (categories.length === 0) {
            list.appendChild(make("p", "rules-empty", "Rules will be added soon."));
            return;
        }

        categories.forEach(function (category, categoryIndex) {

            const wrapper = make("div", "rule-category");

            const heading = make("div", "category-title");

            heading.appendChild(make("span", "rule-number", pad(categoryIndex + 1)));

            const text = make("div");

            text.appendChild(make("h2", "", category.title));

            if (category.description) {
                text.appendChild(make("p", "", category.description));
            }

            heading.appendChild(text);

            const grid = make("div", "rules-grid");

            rules
                .filter(function (rule) {
                    return rule.category_id === category.id;
                })
                .forEach(function (rule, ruleIndex) {

                    const card = make("div", "rule-card");

                    card.appendChild(make("span", "", pad(ruleIndex + 1)));
                    card.appendChild(make("h3", "", rule.title));

                    if (rule.description) {
                        card.appendChild(make("p", "", rule.description));
                    }

                    grid.appendChild(card);

                });

            wrapper.appendChild(heading);
            wrapper.appendChild(grid);

            list.appendChild(wrapper);

        });

    }


    Promise.all([
        window.spark.select("site_settings", "select=key,value"),
        window.spark.select(
            "rule_categories",
            "select=id,title,description&order=sort_order.asc,created_at.asc"
        ),
        window.spark.select(
            "rules",
            "select=category_id,title,description&order=sort_order.asc,created_at.asc"
        )
    ])
        .then(function (results) {

            applySettings(results[0]);

            render(results[1], results[2]);

            reveal();

        })
        .catch(reveal);

});
