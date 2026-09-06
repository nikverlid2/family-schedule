self.addEventListener("push", event => {
  let data = {};
  try{ data = event.data ? event.data.json() : {}; }catch(e){}
  const title = data.title || "Семейное расписание";
  const options = {
    body: data.body || "Расписание изменено",
    tag: data.tag || "family-schedule",
    renotify: true,
    data: { url: data.url || "./" }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async()=>{
    const target = new URL((event.notification.data && event.notification.data.url) || "./", self.registration.scope).href;
    const windows = await clients.matchAll({type:"window", includeUncontrolled:true});
    for(const client of windows){
      if("navigate" in client){
        await client.navigate(target);
        return client.focus();
      }
    }
    return clients.openWindow(target);
  })());
});
