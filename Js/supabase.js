/* =====================================
   SUPABASE CONNECTION (HEROS SMP)
   Sirf publishable (public) key yahan hai - safe hai.
   service_role / secret key yahan KABHI mat daalna.
===================================== */

(function () {

    const config = {
        url: "https://jskjihjhzzjytgzkdaqk.supabase.co",
        key: "sb_publishable_lqQfEESJsrj4HP07MsqL9g_ZcamJHTs",
        currency: "\u20B9"   /* store mein price ke aage ka symbol */
    };


    /* Table se rows padhna (sirf READ) */

    async function select(table, query) {

        const response = await fetch(
            config.url + "/rest/v1/" + table + "?" + query,
            {
                headers: {
                    apikey: config.key,
                    Accept: "application/json"
                }
            }
        );

        if (!response.ok) {
            throw new Error("Supabase error " + response.status);
        }

        return response.json();

    }


    window.spark = {
        config: config,
        select: select,
        client: null
    };


    /* Login / admin ke liye supabase-js client
       (js/vendor/supabase.js pehle load hona chahiye) */

    if (window.supabase && typeof window.supabase.createClient === "function") {

        window.spark.client = window.supabase.createClient(
            config.url,
            config.key,
            { auth: { flowType: "implicit" } }
        );

    }

})();
