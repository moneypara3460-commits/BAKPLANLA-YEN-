/*
===========================================================
  BAKPLANLA — ARAPÇA (العربية) DİL DESTEĞİ
  Uygulamadaki metinler tx(tr, en, de) ile yazılı. Arapça seçilince
  İngilizce metin bu sözlükte aranır ve Arapçası gösterilir.
  Sözlükte olmayan bir metin çıkarsa uygulama çökmez, İngilizcesi görünür.
  Yeni metin eklemek: AR sözlüğüne "İngilizce metin": "Arapça metin" satırı ekle.
===========================================================
*/

import { AR1 } from './arabicSozluk1';
import { AR2 } from './arabicSozluk2';

const AR = { ...AR1, ...AR2 };

/* Sayı veya ad içeren metinler: İngilizce kalıp -> Arapça kalıp ($1, $2 ... yerine değerler gelir) */
const AR_PATTERNS = [
  [new RegExp("^([\\s\\S]*?) days overdue$"), "متأخرة $1 يوم"],
  [new RegExp("^([\\s\\S]*?) days left$"), "متبقٍ $1 يوم"],
  [new RegExp("^([\\s\\S]*?) opportunities found$"), "تم العثور على $1 فرصة"],
  [new RegExp("^\"([\\s\\S]*?)\" will be removed from your device list\\.$"), "ستتم إزالة \"$1\" من قائمة أجهزتك."],
  [new RegExp("^This code expires in ([\\s\\S]*?):([\\s\\S]*?)\\. It can be used once\\.$"), "تنتهي صلاحية هذا الرمز خلال $1:$2. يمكن استخدامه مرة واحدة."],
  [new RegExp("^Backup on the server: ([\\s\\S]*?) tasks, ([\\s\\S]*?) documents([\\s\\S]*?)\\.$"), "النسخة الاحتياطية على الخادم: $1 مهمة، $2 مستند$3."],
  [new RegExp("^Last backup \\(from this device\\): ([\\s\\S]*?) — ([\\s\\S]*?) tasks, ([\\s\\S]*?) documents\\.$"), "آخر نسخة احتياطية (من هذا الجهاز): $1 — $2 مهمة، $3 مستند."],
  [new RegExp("^Reminders are set for ([\\s\\S]*?) tasks\\. They update automatically as you add or remove tasks\\.$"), "تم ضبط التذكيرات لـ $1 مهمة. يتم تحديثها تلقائيًا عند إضافة المهام أو حذفها."],
  [new RegExp("^([\\s\\S]*?) more questions to answer\\.$"), "متبقٍ $1 سؤال للإجابة."],
  [new RegExp("^Match: ([\\s\\S]*?)%$"), "التوافق: $1%"],
  [new RegExp("^New questions were added\\. Your earlier answers are kept; just answer the remaining ([\\s\\S]*?)\\.$"), "تمت إضافة أسئلة جديدة. إجاباتك السابقة محفوظة؛ يكفي أن تجيب عن الأسئلة المتبقية وعددها $1."],
  [new RegExp("^([\\s\\S]*?) short questions, about 6 minutes\\. No internet needed, your answers stay on your device\\.$"), "$1 سؤالًا قصيرًا، نحو 6 دقائق. لا حاجة إلى الإنترنت، وتبقى إجاباتك على جهازك."],
  [new RegExp("^([\\s\\S]*?) shifts with ([\\s\\S]*?)\\+ stars = 1 coupon\\. All roles at this venue count, max ([\\s\\S]*?) per day\\.$"), "$1 مناوبات بـ $2 نجوم أو أكثر = قسيمة واحدة. تُحتسب جميع الأدوار في هذا المكان، بحد أقصى $3 يوميًا."],
  [new RegExp("^Last ([\\s\\S]*?) shifts$"), "آخر $1 مناوبات"],
  [new RegExp("^Finish ([\\s\\S]*?) shifts with ([\\s\\S]*?)\\+ stars at a venue and your coupon appears here\\.$"), "أكمل $1 مناوبات بـ $2 نجوم أو أكثر في مكان ما وستظهر قسيمتك هنا."],
  [new RegExp("^([\\s\\S]*?) usable coupons$"), "$1 قسيمة قابلة للاستخدام"],
  [new RegExp("^Get ([\\s\\S]*?) stars to unlock the next level\\.$"), "احصل على $1 نجوم لفتح المستوى التالي."],
  [new RegExp("^⚠️ The server did not accept this shift \\(([\\s\\S]*?)\\)\\. It did not count\\.$"), "⚠️ لم يقبل الخادم هذه المناوبة ($1). لم تُحتسب."],
  [new RegExp("^Level up: ([\\s\\S]*?)!$"), "ارتقيت إلى المستوى: $1!"],
  [new RegExp("^Shelf done! \\+([\\s\\S]*?)$"), "اكتمل الرف! +$1"],
  [new RegExp("^([\\s\\S]*?) is checked out! \\+([\\s\\S]*?)$"), "تم إنهاء حساب $1! +$2"],
  [new RegExp("^([\\s\\S]*?) says thanks! \\+([\\s\\S]*?)$"), "$1 يشكرك! +$2"],
  [new RegExp("^([\\s\\S]*?) got tired of waiting and left\\.$"), "$1 ملّ من الانتظار وغادر."],
  [new RegExp("^Cup discarded \\(−([\\s\\S]*?)\\)\\.$"), "تم التخلص من الكوب (−$1)."],
  [new RegExp("^Checked the plan \\(−([\\s\\S]*?)\\)\\.$"), "تم النظر إلى المخطط (−$1)."],
  [new RegExp("^Last item voided \\(−([\\s\\S]*?)\\)\\.$"), "تم إلغاء آخر منتج (−$1)."],
  [new RegExp("^The customer paid ([\\s\\S]*?)\\. Work out and give the change\\.$"), "دفع العميل $1. احسب الباقي وأعطه."],
  [new RegExp("^Surplus returned to storage\\. \\+([\\s\\S]*?)$"), "أُعيد الفائض إلى المخزن. +$1"],
  [new RegExp("^Shortage reported to storage\\. \\+([\\s\\S]*?)$"), "تم الإبلاغ عن النقص للمخزن. +$1"],
  [new RegExp("^([\\s\\S]*?)% discount applied\\. \\+([\\s\\S]*?)$"), "تم تطبيق خصم $1%. +$2"],
  [new RegExp("^Card declined\\. The customer paid ([\\s\\S]*?) cash; give the change\\.$"), "رُفضت البطاقة. دفع العميل $1 نقدًا؛ أعطِ الباقي."],
  [new RegExp("^Right spot! \\+([\\s\\S]*?)$"), "المكان الصحيح! +$1"],
  [new RegExp("^Expired item removed\\. \\+([\\s\\S]*?)$"), "تمت إزالة منتج منتهي الصلاحية. +$1"],
  [new RegExp("^You showed the customer the right way\\. \\+([\\s\\S]*?)$"), "أرشدت العميل إلى المكان الصحيح. +$1"],
  [new RegExp("^Wrong aisle \\(−([\\s\\S]*?)\\)\\. Correct: ([\\s\\S]*?)$"), "ممر خاطئ (−$1). الصحيح: $2"],
  [new RegExp("^([\\s\\S]*?) aisle$"), "ممر $1"],
  [new RegExp("^⚠️ short · ([\\s\\S]*?)/([\\s\\S]*?)$"), "⚠️ نقص · $1/$2"],
  [new RegExp("^Excuse me, which aisle is the ([\\s\\S]*?) in\\?$"), "عفوًا، في أي ممر أجد $1؟"],
  [new RegExp("^Items dated ([\\s\\S]*?) \\(today\\) can still be sold; earlier dates are expired\\.$"), "المنتجات بتاريخ $1 (اليوم) ما زالت قابلة للبيع؛ والتواريخ الأقدم منتهية الصلاحية."],
  [new RegExp("^Your Pro access runs until ([\\s\\S]*?) and will not renew\\.$"), "يستمر وصولك إلى Pro حتى $1 ولن يتجدد."],
  [new RegExp("^BAKPLANLA Pro is active([\\s\\S]*?)\\.$"), "BAKPLANLA Pro مفعّل$1."],
  [new RegExp("^I couldn't find a suitable place around ([\\s\\S]*?)\\.$"), "لم أتمكن من العثور على مكان مناسب حول $1."],
  [new RegExp("^([\\s\\S]*?) results outside your budget were hidden\\.$"), "تم إخفاء $1 نتيجة خارج ميزانيتك."],
  [new RegExp("^~([\\s\\S]*?) TL per person \\(this category averages ([\\s\\S]*?)–([\\s\\S]*?) TL\\)$"), "~$1 ليرة تركية للشخص (متوسط هذه الفئة $2–$3 ليرة تركية)"],
  [new RegExp("^([\\s\\S]*?) around ([\\s\\S]*?)\\.$"), "$1 حول $2."],
  [new RegExp("^Task reminders on \\(([\\s\\S]*?):00\\)$"), "تذكيرات المهام مفعّلة ($1:00)"],
  [new RegExp("^If something goes wrong, write to us:\n([\\s\\S]*?)\n\nPlease include the app version \\(v([\\s\\S]*?)\\) and what you were doing when it happened\\.$"), "إذا حدث خطأ ما، فاكتب لنا:\n$1\n\nيرجى ذكر إصدار التطبيق (v$2) وما كنت تفعله عندما حدث ذلك."],
  [new RegExp("^City/district can be at most ([\\s\\S]*?) characters\\.$"), "يمكن أن تتكون المدينة/الحي من $1 حرفًا كحد أقصى."],
  [new RegExp("^Budget can have at most ([\\s\\S]*?) digits\\.$"), "يمكن أن تتكون الميزانية من $1 أرقام كحد أقصى."],
  [new RegExp("^You have used your free use of ([\\s\\S]*?)\\. You can upgrade to BAKPLANLA Pro to continue\\.$"), "لقد استخدمت استخدامك المجاني لـ $1. يمكنك الترقية إلى BAKPLANLA Pro للمتابعة."],
  [new RegExp("^This device has no data, but the cloud holds a backup with ([\\s\\S]*?) tasks and ([\\s\\S]*?) documents\\. Backing up would replace it with empty data\\. Try \"Restore from Backup\" first\\. Overwrite anyway\\?$"), "لا توجد بيانات على هذا الجهاز، لكن في السحابة نسخة احتياطية تحتوي على $1 مهمة و$2 مستند. النسخ الاحتياطي الآن سيستبدلها ببيانات فارغة. جرّب \"الاستعادة من النسخة الاحتياطية\" أولًا. هل تريد الاستبدال على أي حال؟"],
  [new RegExp("^The cloud holds a backup not made from this device \\(([\\s\\S]*?) tasks, ([\\s\\S]*?) documents\\)\\. Backing up replaces it with this device's data\\. Continue\\?$"), "في السحابة نسخة احتياطية لم تُنشأ من هذا الجهاز ($1 مهمة، $2 مستند). النسخ الاحتياطي يستبدلها ببيانات هذا الجهاز. هل تريد المتابعة؟"],
  [new RegExp("^ ([\\s\\S]*?) document images backed up, ([\\s\\S]*?) could not be\\.$"), " تم نسخ $1 صورة مستند احتياطيًا، وتعذّر نسخ $2."],
  [new RegExp("^ ([\\s\\S]*?) document images were backed up too\\.$"), " تم نسخ $1 صورة مستند احتياطيًا أيضًا."],
  [new RegExp("^Backed up and verified: ([\\s\\S]*?) tasks, ([\\s\\S]*?) documents\\.([\\s\\S]*?)$"), "تم النسخ الاحتياطي والتحقق: $1 مهمة، $2 مستند.$3"],
  [new RegExp("^From the backup: ([\\s\\S]*?) tasks and ([\\s\\S]*?) new documents will be added([\\s\\S]*?)\\. ([\\s\\S]*?) records that already exist are skipped\\. Your data is not deleted; a copy is saved first so you can undo\\. Document images are not in the backup\\.$"), "من النسخة الاحتياطية: ستتم إضافة $1 مهمة و$2 مستند جديد$3. سيتم تخطي $4 سجل موجود بالفعل. لن تُحذف بياناتك؛ تُحفظ نسخة أولًا لتتمكن من التراجع. صور المستندات ليست ضمن النسخة الاحتياطية."],
  [new RegExp("^ ([\\s\\S]*?) document images were restored too\\.$"), " تمت استعادة $1 صورة مستند أيضًا."],
  [new RegExp("^ ([\\s\\S]*?) images could not be downloaded\\.$"), " تعذّر تنزيل $1 صورة."],
  [new RegExp("^Restored: ([\\s\\S]*?) tasks and ([\\s\\S]*?) documents added\\.([\\s\\S]*?)$"), "تمت الاستعادة: أُضيفت $1 مهمة و$2 مستند.$3"],
  [new RegExp("^([\\s\\S]*?) JOBS$"), "$1 مهنة"],
  [new RegExp("^COMPASS match: ([\\s\\S]*?)%$"), "التوافق مع البوصلة: $1%"],
  [new RegExp("^([\\s\\S]*?) real situations, ([\\s\\S]*?) seconds each\\. Best choice 2 points, okay 1, wrong or timeout 0\\. You learn why after each answer\\.$"), "$1 مواقف حقيقية، $2 ثانية لكل منها. أفضل خيار نقطتان، والمقبول نقطة واحدة، والخاطئ أو انتهاء الوقت صفر. تعرف السبب بعد كل إجابة."],
  [new RegExp("^([\\s\\S]*?)/([\\s\\S]*?) points · \\+([\\s\\S]*?) XP$"), "$1/$2 نقطة · +$3 نقطة خبرة"],
  [new RegExp("^([\\s\\S]*?) timeouts\\.$"), "انتهى الوقت $1 مرات."],
  [new RegExp("^([\\s\\S]*?)'s own careers page will open\\. Any application happens on that site, by your choice; BAKPLANLA is not involved\\.$"), "ستُفتح صفحة الوظائف الخاصة بـ $1. أي طلب توظيف يتم على ذلك الموقع وباختيارك؛ ولا يشارك BAKPLANLA في ذلك."],
  [new RegExp("^([\\s\\S]*?)'s own website will open\\. BAKPLANLA is not responsible for that site\\.$"), "سيُفتح الموقع الإلكتروني الخاص بـ $1. BAKPLANLA غير مسؤول عن ذلك الموقع."],
  [new RegExp("^For BAKPLANLA users · daily ([\\s\\S]*?) · once a day · single-use code$"), "لمستخدمي BAKPLANLA · يوميًا $1 · مرة واحدة في اليوم · رمز لاستخدام واحد"],
  [new RegExp("^Valid today until ([\\s\\S]*?)\\. Show this screen at the till; the cashier scans the QR or types the code\\. Single use\\.$"), "صالح اليوم حتى $1. اعرض هذه الشاشة عند الصندوق؛ يمسح أمين الصندوق رمز QR أو يكتب الرمز. لاستخدام واحد."],
  [new RegExp("^Level ([\\s\\S]*?)/([\\s\\S]*?)$"), "المستوى $1/$2"],
  [new RegExp("^JOB REHEARSAL — ([\\s\\S]*?)/([\\s\\S]*?) jobs tried$"), "تجربة المهنة — تمت تجربة $1/$2 مهنة"],
  [new RegExp("^\\+([\\s\\S]*?) more$"), "+$1 أخرى"],
];

const missCache = new Set();

export const toArabic = (en) => {
  if (typeof en !== 'string' || !en) return en;
  if (Object.prototype.hasOwnProperty.call(AR, en)) return AR[en];
  if (missCache.has(en)) return en;
  for (const [re, tpl] of AR_PATTERNS) {
    const m = re.exec(en);
    if (m) return tpl.replace(/\$(\d)/g, (_, k) => toArabic(m[Number(k)] || ''));
  }
  if (missCache.size < 500) missCache.add(en);
  return en;
};

/* { tr, en, de } biçimli nesnelerden dile göre seçim (değer dizi de olabilir) */
export const pickByLang = (obj, lang) => {
  if (!obj) return obj;
  if (lang === 'ar') {
    if (obj.ar !== undefined) return obj.ar;
    const en = obj.en;
    if (Array.isArray(en)) return en.map(toArabic);
    if (typeof en === 'string') return toArabic(en);
  }
  return obj[lang] || obj.tr;
};
