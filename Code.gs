/**
 * รับออเดอร์จากแลนดิ้งเพจ แล้วบันทึกลง Google Sheet
 * เขียนแบบเข้ากันได้ทุก runtime (ไม่ใช้ spread / padStart / arrow function)
 *
 * วิธีใช้:
 * 1) เปิด Google Sheet > ส่วนขยาย (Extensions) > Apps Script  (ต้องเปิดจากในชีต)
 * 2) ลบโค้ดเดิมทิ้งทั้งหมด แล้ววางโค้ดนี้ > กดบันทึก
 * 3) เลือกฟังก์ชัน setup ที่แถบด้านบน > กด Run > อนุญาตสิทธิ์ (ครั้งแรกเท่านั้น)
 * 4) เลือกฟังก์ชัน testOrder > Run แล้วดูว่ามีแถวใหม่ในชีต Orders
 * 5) Deploy > New deployment > Web app
 *    Execute as: Me | Who has access: Anyone > Deploy
 * 6) คัดลอก Web app URL ไปใส่ API_URL ใน index.html
 *
 * ห้ามกด Run ที่ doPost โดยตรง (จะ error เพราะไม่มีข้อมูลส่งเข้ามา) ให้ใช้ testOrder แทน
 */

// ถ้าสคริปต์ไม่ได้เปิดจากในชีต ให้ใส่ ID ของชีตตรงนี้
// (ID คือข้อความยาวๆ ใน URL ระหว่าง /d/ กับ /edit)
var SPREADSHEET_ID = "";

var SHEET_NAME = "Orders";
var SKUS = ["DK70", "MK-HZ"]; // ต้องตรงกับ PRODUCTS ใน index.html

function getHeaders_() {
  var h = ["เลขออเดอร์", "วันที่เวลา", "ชื่อผู้รับ", "เบอร์โทร", "ที่อยู่จัดส่ง", "หมายเหตุ"];
  for (var i = 0; i < SKUS.length; i++) h.push("จำนวน " + SKUS[i]);
  h.push("รายการสินค้า", "ยอดรวม (บาท)", "สถานะ");
  return h;
}

function getSheet_() {
  var ss = SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error("ไม่พบ Spreadsheet: ให้เปิด Apps Script จากเมนูในชีต หรือใส่ SPREADSHEET_ID");
  }
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    var headers = getHeaders_();
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#e9b44c");
    sh.setFrozenRows(1);
  }
  return sh;
}

// รันครั้งแรกเพื่อสร้างชีตและขออนุญาตสิทธิ์
function setup() {
  var sh = getSheet_();
  Logger.log("พร้อมใช้งาน ชีต: " + sh.getName());
}

// ทดสอบบันทึกออเดอร์จำลอง
function testOrder() {
  var fake = {
    postData: {
      contents: JSON.stringify({
        name: "ทดสอบ ระบบ",
        phone: "0812345678",
        address: "123 ถ.สุขุมวิท กรุงเทพ 10110",
        note: "ออเดอร์ทดสอบ",
        items: [{ sku: "DK70", name: "ดาร์กช็อก 70%", qty: 2, price: 89 }],
        total: 178
      })
    }
  };
  var res = doPost(fake);
  Logger.log(res.getContent());
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    if (!e || !e.postData) throw new Error("ไม่มีข้อมูลส่งเข้ามา");
    lock.waitLock(10000);
    var d = JSON.parse(e.postData.contents);

    if (!d.name || !d.phone || !d.address || !d.items || !d.items.length) {
      throw new Error("ข้อมูลไม่ครบ");
    }

    var sh = getSheet_();
    var now = new Date();
    var seq = ("000" + sh.getLastRow()).slice(-3);
    var orderId = "CB" + Utilities.formatDate(now, "Asia/Bangkok", "yyMMdd") + "-" + seq;

    var qtyBySku = {};
    var names = [];
    for (var i = 0; i < d.items.length; i++) {
      qtyBySku[d.items[i].sku] = Number(d.items[i].qty);
      names.push(d.items[i].name + " x" + d.items[i].qty);
    }

    var row = [
      orderId,
      Utilities.formatDate(now, "Asia/Bangkok", "yyyy-MM-dd HH:mm:ss"),
      d.name,
      "'" + d.phone, // ใส่ ' เพื่อเก็บเป็นข้อความ ไม่ตัดเลข 0 หน้า
      d.address,
      d.note || ""
    ];
    for (var j = 0; j < SKUS.length; j++) row.push(qtyBySku[SKUS[j]] || 0);
    row.push(names.join(", "), Number(d.total), "รอแพ็ค");

    sh.appendRow(row);
    return json_({ ok: true, orderId: orderId });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

// เปิด Web app URL ในเบราว์เซอร์เพื่อเช็กว่า deploy สำเร็จ
function doGet() {
  return json_({ ok: true, message: "Order API is running" });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
