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
            await renderPdf(arrayBuffer, patterns);
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

    async function renderPdf(arrayBuffer, patterns) {
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

        return wrapper;
    }

})();
