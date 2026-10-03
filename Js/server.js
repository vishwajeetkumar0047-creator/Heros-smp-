/* =====================================
   PLAY BUTTONS + SERVER STATUS  (home page)
   - "Play now!" dabane par server IP copy hota hai
   - IP admin panel (Site tab) se set hoti hai
   - Live players count: api.mcsrvstat.us (Java servers)
===================================== */

(function () {

    const spark = window.spark;

    const buttons = document.querySelectorAll(".play-btn, .final-play-btn");

    if (!buttons.length) return;

    let serverIp = "";
    let bedrockPort = "";
    let toastTimer = null;


    function make(tag, className, text) {

        const element = document.createElement(tag);

        if (className) element.className = className;

        if (text !== undefined && text !== null) element.textContent = text;

        return element;

    }

    function toast(message) {

        let box = document.getElementById("serverToast");

        if (!box) {

            box = make("div", "server-toast");
            box.id = "serverToast";
            box.setAttribute("role", "status");

            document.body.appendChild(box);

        }

        box.textContent = message;

        /* reflow ke baad class lagao taaki animation chale */

        void box.offsetWidth;

        box.classList.add("show");

        clearTimeout(toastTimer);

        toastTimer = setTimeout(function () {
            box.classList.remove("show");
        }, 5000);

    }

    function copyText(text) {

        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text);
        }

        return new Promise(function (resolve, reject) {

            const area = document.createElement("textarea");

            area.value = text;
            area.style.position = "fixed";
            area.style.opacity = "0";

            document.body.appendChild(area);

            area.select();

            try {
                document.execCommand("copy") ? resolve() : reject();
            } catch (error) {
                reject(error);
            }

            area.remove();

        });

    }


    /* =========================
       CLICK
    ========================= */

    buttons.forEach(function (button) {

        button.addEventListener("click", function () {

            if (!serverIp) {

                toast("The server IP has not been added yet. Please check our Discord for the address.");

                return;

            }

            /* copy format:
               IP:- play.example.com
               Port:- 19132   (port sirf tab jab admin ne Bedrock port set kiya ho) */

            let text = "IP:- " + serverIp;

            if (bedrockPort) text += "\nPort:- " + bedrockPort;

            copyText(text).then(function () {

                toast(
                    (bedrockPort ? "IP and port copied" : "Server IP copied") +
                    "  —  open Minecraft, go to Multiplayer / Servers, Add Server and paste it."
                );

            }, function () {

                toast("IP: " + serverIp + (bedrockPort ? "  |  Port: " + bedrockPort : ""));

            });

        });

    });


    /* =========================
       STATUS (online players)
    ========================= */

    const CACHE_KEY = "sparkServerStatus";

    async function fetchStatus(ip) {

        try {

            const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");

            if (cached && cached.ip === ip && Date.now() - cached.time < 60000) {
                return cached.data;
            }

        } catch (error) {}

        const controller = new AbortController();

        const timer = setTimeout(function () { controller.abort(); }, 6000);

        try {

            const response = await fetch(
                "https://api.mcsrvstat.us/3/" + encodeURIComponent(ip),
                { signal: controller.signal }
            );

            clearTimeout(timer);

            if (!response.ok) return null;

            const json = await response.json();

            const data = {
                online: json.online === true,
                players: json.players ? json.players.online : 0,
                max: json.players ? json.players.max : 0
            };

            try {
                sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ip: ip, time: Date.now(), data: data }));
            } catch (error) {}

            return data;

        } catch (error) {

            clearTimeout(timer);

            return null;

        }

    }

    function statusText(data) {

        if (!data) return "";

        return data.online ? data.players + " online" : "Offline";

    }

    function buildUi(status) {

        /* hero: button ke upar chhota pill */

        const heroArea = document.querySelector(".hero-button-area");

        let pill = null;

        if (heroArea) {

            pill = make("div", "server-pill");
            pill.hidden = true;

            pill.appendChild(make("span", "server-dot"));
            pill.appendChild(make("span", "server-pill-text"));

            heroArea.insertBefore(pill, heroArea.firstChild);

        }

        /* neeche wale Play button ke niche IP line */

        const finalSection = document.querySelector(".final-play");

        let line = null;

        if (finalSection) {

            line = make("div", "server-ip-line");

            line.appendChild(make("span", "", "Server IP: "));
            line.appendChild(make("strong", "", serverIp));

            if (bedrockPort) {

                line.appendChild(make("span", "", "  ·  Bedrock port: "));
                line.appendChild(make("strong", "", bedrockPort));

            }

            const extra = make("span", "server-ip-status");

            line.appendChild(extra);

            finalSection.appendChild(line);

        }

        if (status) {

            const text = statusText(status);

            if (pill) {

                pill.hidden = false;

                pill.classList.toggle("offline", !status.online);

                pill.querySelector(".server-pill-text").textContent = text;

                if (status.online && status.max) {
                    pill.title = status.players + " of " + status.max + " players online";
                }

            }

            if (line) {

                line.querySelector(".server-ip-status").textContent = " · " + text;

            }

        }

    }


    /* =========================
       LOAD IP
    ========================= */

    if (!spark) return;

    spark
        .select("site_settings", "select=key,value&key=in.(server_ip,bedrock_port)")
        .then(async function (rows) {

            rows.forEach(function (row) {

                const value = row.value ? String(row.value).trim() : "";

                if (row.key === "server_ip") serverIp = value;
                if (row.key === "bedrock_port") bedrockPort = value;

            });

            if (!serverIp) return;

            const status = await fetchStatus(serverIp);

            buildUi(status);

        })
        .catch(function () {});

})();
