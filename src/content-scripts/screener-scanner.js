; (function () {
    function scanScreenerStocks() {
        try {
            const rowSelector =
                "body > main > div.card.card-large > div.responsive-holder.fill-card-width > table > tbody > tr[data-row-company-id]"
            const rows = Array.from(document.querySelectorAll(rowSelector))
            const symbols = []

            for (const row of rows) {
                const links = Array.from(
                    row.querySelectorAll('a[href*="/company/"]')
                )
                for (const link of links) {
                    const href = link.getAttribute("href") || ""
                    const match = href.match(/\/company\/([^\/]+)/)
                    if (match && match[1]) {
                        const symbol = match[1].trim().toUpperCase()
                        if (symbol && !symbols.includes(symbol)) {
                            symbols.push(symbol)
                        }
                    }
                }
            }

            return {
                ok: true,
                symbols: symbols,
                error: ""
            }
        } catch (error) {
            return {
                ok: false,
                symbols: [],
                error: error.message || "Failed to scan Screener stocks."
            }
        }
    }

    window.__SCREENER_SCAN = scanScreenerStocks
})()
