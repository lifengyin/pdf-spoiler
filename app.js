(function () {
    "use strict";

    const pdfjsLib = window.pdfjsLib;
    if (!pdfjsLib) {
        console.error("PDF.js failed to load");
        return;
    }

    pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

    const CSS_SCALE = 1.5;
    const DPR = window.devicePixelRatio || 1;

    document.getElementById("pdf-input").addEventListener("change", handleFileSelect);

    async function handleFileSelect(e) {
        const file = e.target.files[0];
        if (!file) return;

        document.getElementById("file-name").textContent = "Loading " + file.name + "...";
        try {
            const arrayBuffer = await file.arrayBuffer();
            const patterns = getPatterns();
            await renderPdf(arrayBuffer, file.name, patterns);
        } catch (err) {
            console.error("Failed to render PDF:", err);
            document.getElementById("file-name").textContent = "Error: " + err.message;
        }
    }

    function getPatterns() {
        const raw = document.getElementById("patterns-input").value;
        return raw.split("\n")
            .map(s => s.trim().toLowerCase())
            .filter(s => s.length > 0);
    }

    async function renderPdf(arrayBuffer, fileName, patterns) {
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const container = document.getElementById("pdf-container");

        container.innerHTML = "";
        document.getElementById("upload-screen").hidden = true;
        document.getElementById("viewer-screen").hidden = false;

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const wrapper = await renderPage(page, i, patterns);
            container.appendChild(wrapper);
        }
    }

    async function renderPage(page, pageNum, patterns) {
        const cssViewport = page.getViewport({ scale: CSS_SCALE });
        const renderViewport = page.getViewport({ scale: CSS_SCALE * DPR });

        const wrapper = document.createElement("div");
        wrapper.className = "page-wrapper";
        wrapper.id = "page-" + pageNum;
        wrapper.style.width = cssViewport.width + "px";
        wrapper.style.height = cssViewport.height + "px";

        const canvas = document.createElement("canvas");
        canvas.width = renderViewport.width;
        canvas.height = renderViewport.height;
        canvas.style.width = cssViewport.width + "px";
        canvas.style.height = cssViewport.height + "px";
        wrapper.appendChild(canvas);

        const ctx = canvas.getContext("2d");
        await page.render({ canvasContext: ctx, viewport: renderViewport }).promise;

        const textLayerDiv = document.createElement("div");
        textLayerDiv.className = "textLayer";
        wrapper.appendChild(textLayerDiv);

        const textContent = await page.getTextContent();
        await pdfjsLib.renderTextLayer({
            textContent: textContent,
            container: textLayerDiv,
            viewport: cssViewport,
        }).promise;

        const endOfContent = document.createElement("div");
        endOfContent.className = "endOfContent";
        textLayerDiv.appendChild(endOfContent);

        textLayerDiv.addEventListener("mousedown", () => endOfContent.classList.add("active"));
        document.addEventListener("mouseup", () => endOfContent.classList.remove("active"));

        const solutionRegions = findSolutions(textContent, cssViewport, patterns);
        for (const region of solutionRegions) {
            wrapper.appendChild(createOverlay(region));
        }

        return wrapper;
    }

    // --- Solution detection ---

    const SECTION_PATTERN = /^\d+[.)]\s/;
    const SUBPART_PATTERN = /^[(\[]?[a-z][)\].]\s/;

    function isNewSection(str) {
        const trimmed = str.trim();
        return SECTION_PATTERN.test(trimmed) || SUBPART_PATTERN.test(trimmed);
    }

    function findSolutions(textContent, viewport, patterns) {
        if (!patterns.length) return [];

        const items = textContent.items;
        const regions = [];

        for (let i = 0; i < items.length; i++) {
            const text = items[i].str.toLowerCase();
            for (const pattern of patterns) {
                const idx = text.indexOf(pattern);
                if (idx === -1) continue;

                const bbox = buildAnswerBbox(items, i, idx + pattern.length, viewport, patterns);
                if (bbox) regions.push(bbox);
                break;
            }
        }

        return regions;
    }

    function getItemBbox(item, viewport) {
        if (!item.str.trim()) return null;

        const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
        const fontHeight = Math.hypot(tx[2], tx[3]);
        const left = tx[4];
        const top = tx[5] - fontHeight;
        const width = item.width * viewport.scale;

        if (width <= 0 || fontHeight <= 0) return null;

        return { left, top, right: left + width, bottom: top + fontHeight };
    }

    function buildAnswerBbox(items, matchIndex, charOffset, viewport, patterns) {
        const matchItem = items[matchIndex];
        const matchBox = getItemBbox(matchItem, viewport);
        if (!matchBox) return null;

        const totalWidth = matchBox.right - matchBox.left;
        const patternRatio = matchItem.str.length > 0 ? charOffset / matchItem.str.length : 0;
        const answerLeft = matchBox.left + totalWidth * patternRatio + 4;

        const tx = pdfjsLib.Util.transform(viewport.transform, matchItem.transform);
        const fontHeight = Math.hypot(tx[2], tx[3]);
        const rightMargin = viewport.width * 0.92;

        let answerBottom = matchBox.bottom;

        // Scan backward to find the bottom of the previous line (accounting for tall content)
        let prevLineBottom = null;
        let prevLineTop = null;
        for (let i = matchIndex - 1; i >= 0; i--) {
            const item = items[i];
            if (!item.str || !item.str.trim()) continue;

            const box = getItemBbox(item, viewport);
            if (!box) continue;

            const isAbove = box.bottom < matchBox.top - fontHeight * 0.3;

            if (!isAbove && box.left < answerLeft - 5) continue;

            if (isAbove) {
                if (prevLineTop === null) {
                    prevLineTop = box.top;
                    prevLineBottom = box.bottom;
                }
                if (box.top >= prevLineTop - fontHeight * 2) {
                    if (box.bottom > prevLineBottom) prevLineBottom = box.bottom;
                } else {
                    break;
                }
                continue;
            }

            if (isNewSection(item.str)) {
                if (prevLineBottom === null || box.bottom > prevLineBottom) {
                    prevLineBottom = box.bottom;
                }
                break;
            }
        }

        const answerTop = prevLineBottom !== null
            ? prevLineBottom + fontHeight * 0.3
            : matchBox.top - fontHeight * 0.3;

        // Scan forward to extend the answer region downward
        for (let i = matchIndex + 1; i < items.length; i++) {
            const item = items[i];
            if (!item.str || !item.str.trim()) continue;

            const box = getItemBbox(item, viewport);
            if (!box) continue;

            if (box.top > matchBox.bottom + fontHeight * 1.5) break;
            if (isNewSection(item.str)) break;

            const lower = item.str.toLowerCase();
            if (patterns.some(p => lower.indexOf(p) !== -1)) break;

            if (box.left >= answerLeft - 5 && box.bottom > answerBottom) {
                answerBottom = box.bottom;
            }
        }

        return {
            left: answerLeft,
            top: answerTop - 2,
            right: rightMargin,
            bottom: answerBottom + 2,
        };
    }

    // --- Overlay ---

    function createOverlay(bbox) {
        const PAD = 4;
        const overlay = document.createElement("div");
        overlay.className = "solution-overlay";
        overlay.style.left = (bbox.left - PAD) + "px";
        overlay.style.top = bbox.top + "px";
        overlay.style.width = (bbox.right - bbox.left + PAD * 2) + "px";
        overlay.style.height = (bbox.bottom - bbox.top + PAD) + "px";

        const label = document.createElement("span");
        label.className = "overlay-label";
        label.textContent = "Click to reveal";
        overlay.appendChild(label);

        overlay.addEventListener("click", function () {
            this.classList.toggle("revealed");
        });

        return overlay;
    }

})();
