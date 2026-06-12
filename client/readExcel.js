import xlsx from 'xlsx';

const path = "d:/OneDrive - 宏碁資訊服務股份有限公司/文件/GitHub/pmps/範本.xlsx";
const workbook = xlsx.readFile(path);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

console.log("Headers:", JSON.stringify(data[0]));
