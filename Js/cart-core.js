/* =====================================
   CART (shopping cart) - browser mein save hota hai
   window.sparkCart.add / set / remove / clear / get / count
   Asli price checkout par database se aata hai (yahan sirf item id + quantity).
===================================== */

(function () {

    const KEY = "sparkCart";
    const MAX_LINES = 20;
    const MAX_QTY = 99;


    function read() {

        try {

            const raw = JSON.parse(localStorage.getItem(KEY) || "[]");

            if (!Array.isArray(raw)) return [];

            return raw
                .filter(function (line) {
                    return line && typeof line.id === "string" &&
                        Number.isInteger(line.qty) && line.qty >= 1;
                })
                .map(function (line) {
                    return { id: line.id, qty: Math.min(line.qty, MAX_QTY) };
                })
                .slice(0, MAX_LINES);

        } catch (error) {

            return [];

        }

    }

    function write(lines) {

        try {
            localStorage.setItem(KEY, JSON.stringify(lines));
        } catch (error) {}

        document.dispatchEvent(new CustomEvent("spark:cart"));

    }

    window.addEventListener("storage", function (event) {

        if (event.key === KEY) document.dispatchEvent(new CustomEvent("spark:cart"));

    });


    window.sparkCart = {

        get: read,

        count: function () {

            return read().reduce(function (total, line) { return total + line.qty; }, 0);

        },

        /* returns false agar cart bhar gaya ho */

        add: function (id, qty) {

            const lines = read();

            const existing = lines.filter(function (line) { return line.id === id; })[0];

            if (existing) {

                existing.qty = Math.min(existing.qty + (qty || 1), MAX_QTY);

            } else {

                if (lines.length >= MAX_LINES) return false;

                lines.push({ id: id, qty: Math.min(qty || 1, MAX_QTY) });

            }

            write(lines);

            return true;

        },

        set: function (id, qty) {

            const number = Math.max(1, Math.min(parseInt(qty, 10) || 1, MAX_QTY));

            write(read().map(function (line) {
                return line.id === id ? { id: id, qty: number } : line;
            }));

        },

        remove: function (id) {

            write(read().filter(function (line) { return line.id !== id; }));

        },

        clear: function () {

            write([]);

        }

    };

})();
