export const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result;
            if (typeof result !== "string") {
                reject(new Error("無法讀取檔案內容"));
                return;
            }
            resolve(result);
        };
        reader.onerror = () => reject(reader.error || new Error("檔案讀取失敗"));
        reader.readAsDataURL(file);
    });
