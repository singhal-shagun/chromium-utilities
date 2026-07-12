;(function () {
    if (window.__HTML_TO_MD_PICKER_READY) {
        return
    }

    window.__HTML_TO_MD_PICKER_READY = true

    let overlay
    let activeElement
    let lastHighlights = []

    function cleanup() {
        if (overlay) {
            overlay.remove()
        }

        lastHighlights.forEach((node) => {
            if (node && node.style) {
                node.style.outline = ""
                node.style.boxShadow = ""
            }
        })
        lastHighlights = []
        activeElement = null
        overlay = null
    }

    function buildSelector(element) {
        if (
            !element ||
            element === document.body ||
            element === document.documentElement
        ) {
            return "body"
        }

        const parts = []
        let current = element
        const MAX_DEPTH = 10

        while (
            current &&
            current !== document.body &&
            current !== document.documentElement &&
            parts.length < MAX_DEPTH
        ) {
            let selector = current.tagName.toLowerCase()

            // ID is unique — use it and stop ascending
            if (current.id) {
                selector += `#${CSS.escape(current.id)}`
                parts.unshift(selector)
                break
            }

            // Add :nth-child() to distinguish elements at the same level
            const parent = current.parentElement
            if (parent) {
                const childIndex =
                    Array.from(parent.children).indexOf(current) + 1
                selector += `:nth-child(${childIndex})`
            }

            // Add up to 2 class names for extra specificity
            const classNames = Array.from(current.classList || []).slice(0, 2)
            if (classNames.length) {
                selector += `.${classNames.map((name) => CSS.escape(name)).join(".")}`
            }

            parts.unshift(selector)
            current = parent
        }

        return parts.join(" > ") || "body"
    }

    function highlightElement(element) {
        if (!element) {
            return
        }

        // Remove previous overlay so they don't accumulate
        if (overlay) {
            overlay.remove()
        }

        lastHighlights.forEach((node) => {
            if (node && node.style) {
                node.style.outline = ""
                node.style.boxShadow = ""
            }
        })
        lastHighlights = []

        const rect = element.getBoundingClientRect()
        const margin = 4
        overlay = document.createElement("div")
        overlay.style.position = "fixed"
        overlay.style.left = `${rect.left - margin}px`
        overlay.style.top = `${rect.top - margin}px`
        overlay.style.width = `${rect.width + margin * 2}px`
        overlay.style.height = `${rect.height + margin * 2}px`
        overlay.style.border = "2px solid #ff6b6b"
        overlay.style.boxShadow = "0 0 0 9999px rgba(0, 0, 0, 0.22)"
        overlay.style.pointerEvents = "none"
        overlay.style.zIndex = "2147483647"
        overlay.style.borderRadius = "4px"
        document.body.appendChild(overlay)

        element.style.outline = "2px solid #ff6b6b"
        element.style.boxShadow = "0 0 0 9999px rgba(255, 107, 107, 0.16)"
        lastHighlights.push(element)
        activeElement = element
    }

    function handleMouseMove(event) {
        const target = event.target
        if (target && target !== activeElement) {
            highlightElement(target)
        }
    }

    function handleClick(event) {
        event.preventDefault()
        event.stopPropagation()
        const selector = buildSelector(activeElement || event.target)
        chrome.runtime.sendMessage({
            type: "html-markdown-picker-selection",
            selector
        })
        stopPicker()
    }

    function startPicker() {
        cleanup()
        document.addEventListener("mousemove", handleMouseMove, true)
        document.addEventListener("click", handleClick, true)
        document.addEventListener("keydown", handleKeyDown, true)
    }

    function stopPicker() {
        cleanup()
        document.removeEventListener("mousemove", handleMouseMove, true)
        document.removeEventListener("click", handleClick, true)
        document.removeEventListener("keydown", handleKeyDown, true)
    }

    function handleKeyDown(event) {
        if (event.key === "Escape") {
            stopPicker()
            chrome.runtime.sendMessage({
                type: "html-markdown-picker-cancelled"
            })
        }
    }

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message && message.type === "html-markdown-picker-start") {
            startPicker()
            sendResponse({ ok: true })
            return true
        }

        if (message && message.type === "html-markdown-picker-stop") {
            stopPicker()
            sendResponse({ ok: true })
            return true
        }

        return false
    })
})()
