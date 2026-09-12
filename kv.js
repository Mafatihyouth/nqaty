// دالة خادم بسيطة على Vercel تتوسط بين الموقع وقاعدة بيانات Upstash Redis.
// تدعم: GET لقراءة قيمة مفتاح، POST لكتابة قيمة مفتاح.
// أسماء المتغيرات البيئية تُقرأ تلقائيًا بعد ربط Upstash بمشروعك على Vercel
// (تحقق من التسمية الدقيقة في: Project Settings > Environment Variables)

export default async function handler(req, res) {
  const url =
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return res.status(500).json({ error: "لم يتم العثور على بيانات اتصال Upstash. تأكد من ربط قاعدة البيانات بالمشروع." });
  }

  if (req.method === "GET") {
    const key = req.query.key;
    if (!key) return res.status(400).json({ error: "key مطلوب" });
    try {
      const r = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json();
      return res.status(200).json({ value: data.result });
    } catch (e) {
      return res.status(500).json({ error: "فشل الاتصال بقاعدة البيانات" });
    }
  }

  if (req.method === "POST") {
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    const { key, value } = body || {};
    if (!key) return res.status(400).json({ error: "key مطلوب" });
    try {
      const r = await fetch(`${url}/set/${encodeURIComponent(key)}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "text/plain",
        },
        body: value,
      });
      const data = await r.json();
      return res.status(200).json({ ok: data.result === "OK" });
    } catch (e) {
      return res.status(500).json({ error: "فشل الحفظ في قاعدة البيانات" });
    }
  }

  return res.status(405).json({ error: "طريقة غير مدعومة" });
}
