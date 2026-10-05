import { RESOURCE_UPLOAD_LIMITS, type ResourceUpload } from "@piko/shared";

export async function prepareResourceUpload(files: File[], folder: boolean, progress: (done: number) => void): Promise<Pick<ResourceUpload, "title" | "files">> {
  if (!files.length) throw new Error("没有选择文件。空文件夹无法上传，请选择包含文件的文件夹。");
  if (files.length > RESOURCE_UPLOAD_LIMITS.files) throw new Error("一次最多上传 500 个文件，请分批选择。");
  const large = files.find(file => file.size > RESOURCE_UPLOAD_LIMITS.fileBytes);
  if (large) throw new Error(`「${large.name}」超过 20 MB，请选择更小的文件。`);
  if (files.reduce((total, file) => total + file.size, 0) > RESOURCE_UPLOAD_LIMITS.totalBytes) throw new Error("一次上传总大小不能超过 25 MB，请分批上传。");
  if (folder && files.some(file => !file.webkitRelativePath)) throw new Error("当前环境没有提供文件夹结构，请改用上传文件，或升级系统后重试。");
  const title = (folder ? files[0].webkitRelativePath.split("/")[0] : files.length === 1 ? files[0].name : `${files[0].name} 等 ${files.length} 个文件`).slice(0, 120);
  const result: ResourceUpload["files"] = [];
  for (const file of files) {
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result.slice(reader.result.indexOf(",") + 1)) : reject(new Error("文件读取失败，请重新选择。"));
      reader.onerror = () => reject(new Error(`无法读取「${file.name}」，请检查文件是否还在本机。`));
      reader.onabort = () => reject(new Error("文件读取已取消。"));
      reader.readAsDataURL(file);
    });
    result.push({ path: folder ? file.webkitRelativePath : file.name, data });
    progress(result.length);
  }
  return { title, files: result };
}
