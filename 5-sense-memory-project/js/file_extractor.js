/* ============================================================================
   MATERIAL INTAKE
   Same rule as the working study app:
   - PDF pages and lesson photos are sent to the model as the original file.
   - Word .docx is the only format read into text, via Mammoth.
   - Plain text files and pasted notes stay as text.
   Nothing here invents a lesson from a filename.
============================================================================ */

class MaterialIntake {
  classify(file) {
    const name = (file.name || "").toLowerCase();
    const type = file.type || "";
    if (type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/.test(name)) return "image";
    if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
    if (name.endsWith(".docx") || type.includes("wordprocessingml")) return "docx";
    if (/\.(txt|md|csv|json)$/.test(name) || type.startsWith("text/")) return "text";
    return null;
  }

  formatSize(bytes) {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB"];
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result || "");
      reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
      reader.readAsDataURL(file);
    });
  }

  async readBase64(file) {
    const dataUrl = await this.readAsDataUrl(file);
    const comma = String(dataUrl).indexOf(",");
    return comma >= 0 ? String(dataUrl).slice(comma + 1) : "";
  }

  readText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result || "");
      reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
      reader.readAsText(file, "UTF-8");
    });
  }

  async optimizeImage(file) {
    if (!file.type.startsWith("image/") || file.size < 2.5 * 1024 * 1024) return file;
    try {
      const bitmap = await createImageBitmap(file);
      const maxDimension = 1800;
      if (bitmap.width <= maxDimension && bitmap.height <= maxDimension) return file;
      let w = bitmap.width;
      let h = bitmap.height;
      if (w > h) {
        h = Math.round((h * maxDimension) / w);
        w = maxDimension;
      } else {
        w = Math.round((w * maxDimension) / h);
        h = maxDimension;
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
      if (!blob) return file;
      return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
    } catch (err) {
      console.warn("Image resize skipped:", err);
      return file;
    }
  }

  async build(files, pastedText, onProgress) {
    const report = async (message) => {
      if (onProgress) onProgress(message);
      await new Promise((resolve) => setTimeout(resolve, 30));
    };

    const items = [];
    const notes = (pastedText || "").trim();
    if (notes) {
      await report("Reading the pasted lesson...");
      items.push({ type: "text", name: "Pasted lesson", data: notes });
    }

    const list = files || [];
    for (let index = 0; index < list.length; index++) {
      const entry = list[index];
      await report(`Reading ${entry.name || "file"} (${index + 1} of ${list.length})...`);
      const source = entry.file;
      const kind = entry.kind || this.classify(source);
      if (!kind) {
        throw new Error(`${source.name} is not a PDF, Word document, image, or text file.`);
      }
      if (source.size > 20 * 1024 * 1024) {
        throw new Error(`${source.name} is over 20 MB. Split the lesson and add the parts separately.`);
      }

      if (kind === "docx") {
        if (!window.mammoth) {
          throw new Error("The Word reader is still loading. Try again in a moment.");
        }
        const arrayBuffer = await source.arrayBuffer();
        const result = await window.mammoth.extractRawText({ arrayBuffer });
        const text = (result.value || "").trim();
        if (!text) {
          throw new Error(`${source.name} has no text layer. Save it as PDF, or add photos of the pages.`);
        }
        items.push({ type: "text", name: source.name, data: text });
        continue;
      }

      if (kind === "text") {
        const text = String(await this.readText(source)).trim();
        if (!text) throw new Error(`${source.name} is empty.`);
        items.push({ type: "text", name: source.name, data: text });
        continue;
      }

      let file = source;
      if (kind === "image") file = await this.optimizeImage(source);
      const data = await this.readBase64(file);
      if (!data) throw new Error(`Could not read ${source.name}.`);
      items.push({
        type: "file",
        name: file.name || source.name,
        mimeType: file.type || (kind === "pdf" ? "application/pdf" : "image/jpeg"),
        data
      });
    }

    if (!items.length) {
      throw new Error("Add a lesson file or paste the lesson.");
    }

    await report("Sending the lesson to the model...");
    return { type: "multi", items };
  }
}

window.materialIntake = new MaterialIntake();
