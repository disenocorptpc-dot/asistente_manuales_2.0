export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const formData = await request.formData();
    const file = formData.get('image');
    
    if (!file) return new Response('No file uploaded', { status: 400 });
    
    const ext = file.name ? file.name.split('.').pop() : 'png';
    const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
    
    await env.BUCKET.put(filename, file.stream(), {
      httpMetadata: { contentType: file.type }
    });
    
    return Response.json({ url: `/uploads/${filename}` });
  } catch (e) {
    return new Response(e.message, { status: 500 });
  }
}
