/* =====================================
   MY ORDERS PAGE JS
   User apne orders aur unka status (pending / approved / rejected) dekhta hai
===================================== */

document.addEventListener("DOMContentLoaded", async function () {

    const container = document.getElementById("ordersList");

    if (!container || !window.spark) return;

    const spark = window.spark;
    const client = spark.client;


    function make(tag, className, text) {

        const element = document.createElement(tag);

        if (className) element.className = className;

        if (text !== undefined && text !== null) element.textContent = text;

        return element;

    }

    function showMessage(text, link) {

        container.textContent = "";

        const message = make("p", "orders-status", text);

        container.appendChild(message);

        if (link) {

            const anchor = make("a", "store-orders-link", link.text);

            anchor.href = link.href;

            container.appendChild(anchor);

        }

    }

    function money(value) {

        const number = Number(value);

        return spark.config.currency + (Number.isInteger(number) ? number : number.toFixed(2));

    }

    const statusText = {
        pending: "Pending review",
        approved: "Approved",
        rejected: "Rejected"
    };


    if (!client) {
        showMessage("Could not connect to the server. Please try again later.");
        return;
    }

    const session = await client.auth.getSession();

    if (!session.data || !session.data.session) {

        showMessage(
            "Please log in to see your orders.",
            { text: "Login", href: "login.html?next=orders.html" }
        );

        return;

    }

    const userId = session.data.session.user.id;

    const result = await client
        .from("orders")
        .select("id,total,subtotal,discount,coupon_code,utr,minecraft_username,status,admin_note,created_at,order_items(item_name,quantity,line_total)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100);

    if (result.error) {
        showMessage("Could not load your orders. Please try again later.");
        return;
    }

    if (result.data.length === 0) {

        showMessage("You haven't placed any orders yet.", { text: "Go to Store", href: "store.html" });

        return;

    }

    container.textContent = "";

    const list = make("div", "orders-list");

    result.data.forEach(function (order) {

        const card = make("article", "order-card");

        const top = make("div", "order-top");

        const orderItems = order.order_items || [];

        const title = orderItems.length === 0
            ? "Order"
            : orderItems[0].item_name + " × " + orderItems[0].quantity +
              (orderItems.length > 1 ? "  + " + (orderItems.length - 1) + " more" : "");

        top.appendChild(make("div", "order-name", title));
        top.appendChild(make("span", "order-badge " + order.status, statusText[order.status] || order.status));

        card.appendChild(top);

        if (orderItems.length > 1) {

            const list = make("ul", "order-lines");

            orderItems.forEach(function (line) {

                list.appendChild(make(
                    "li",
                    "",
                    line.item_name + " × " + line.quantity + " — " + money(line.line_total)
                ));

            });

            card.appendChild(list);

        }

        const meta = make("div", "order-meta");

        function addMeta(label, value, className) {

            const item = make("span");

            item.appendChild(document.createTextNode(label + ": "));

            item.appendChild(make("strong", className || "", value));

            meta.appendChild(item);

        }

        if (Number(order.discount) > 0) {
            addMeta("Discount", "−" + money(order.discount) + (order.coupon_code ? " (" + order.coupon_code + ")" : ""));
        }

        addMeta("Total", money(order.total), "order-total");
        addMeta("UTR", order.utr);
        addMeta("Minecraft name", order.minecraft_username);
        addMeta("Date", new Date(order.created_at).toLocaleString());

        card.appendChild(meta);

        if (order.status === "pending") {

            card.appendChild(make(
                "div",
                "order-note",
                "Your payment proof is being checked by our team. This usually takes a little while."
            ));

        }

        if (order.status === "approved") {

            card.appendChild(make(
                "div",
                "order-note",
                "Payment approved! Your item will be delivered to " + order.minecraft_username + "." +
                (order.admin_note ? "\n" + order.admin_note : "")
            ));

        }

        if (order.status === "rejected") {

            card.appendChild(make(
                "div",
                "order-note",
                "Reason: " + (order.admin_note || "Payment could not be verified.") +
                " You can place the order again with the correct details."
            ));

        }

        list.appendChild(card);

    });

    container.appendChild(list);

});
