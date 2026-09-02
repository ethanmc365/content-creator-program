// A single, consistent icon set (Heroicons outline paths, MIT licensed) used
// across the app so we never mix emoji with line icons in navigation/admin UI.
// Usage: <Icon name="megaphone" className="h-5 w-5" />
const PATHS = {
  home: 'M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25',
  flag: 'M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5',
  // One person, for the things that are about somebody on their own -
  // 'Solo travel' on the flight log. `users` is a crowd and reads as a group
  // trip, which is the opposite of what that option means.
  user: 'M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z',
  users: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z',
  chat: 'M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 005 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z',
  envelope: 'M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75',
  // "speaker-wave" reads cleanly as broadcast / announcement.
  megaphone: 'M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.506-1.938-1.354A9.009 9.009 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z',
  bulb: 'M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18',
  trophy: 'M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0',
  money: 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z',
  chart: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
  calendar: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z',
  book: 'M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25',
  shield: 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
  // Clean, simple briefcase: rounded body + handle + divider line.
  briefcase: 'M3.75 8.25h16.5a1.5 1.5 0 011.5 1.5v9a1.5 1.5 0 01-1.5 1.5H3.75a1.5 1.5 0 01-1.5-1.5v-9a1.5 1.5 0 011.5-1.5zM9 8.25V6a1.5 1.5 0 011.5-1.5h3A1.5 1.5 0 0115 6v2.25M2.25 13.5h19.5',
  share: 'M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z',
  chartPie: 'M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z',
  poll: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
  image: 'M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 19.5h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25z',
  // "globe-alt" with meridians - clean fit for the travel map.
  globe: 'M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418',
  // Thumbtack / pushpin (not a map marker) — used for pinned chat messages.
  pin: 'M9 10.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V16a1 1 0 001 1h12a1 1 0 001-1v-.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V7a1 1 0 011-1 2 2 0 000-4H8a2 2 0 000 4 1 1 0 011 1zM12 17v5',
  video: 'M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z',
  plane: 'M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5',
  // Reframing a photo on the profile board. Crop marks, which is the one
  // glyph everybody already reads as "change what is in the frame".
  crop: 'M6.75 3v13.5A1.75 1.75 0 008.5 18.25H21M3 6.75h13.5A1.75 1.75 0 0118.25 8.5V21',
  gamepad: 'M11.25 6.75v6m0 0v6m0-6h6m-6 0h-6M9 12.75a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm7.5-3a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm-3 3a.75.75 0 11-1.5 0 .75.75 0 011.5 0z',
  // Arcade joystick: round knob on top of a stick rising from a rounded base.
  joystick: 'M14.5 4.75a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z M12 7.25V13.5 M5 13.5h14a1.5 1.5 0 011.5 1.5v3a1.5 1.5 0 01-1.5 1.5H5a1.5 1.5 0 01-1.5-1.5v-3A1.5 1.5 0 015 13.5z',
  eye: 'M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  pencil: 'm16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125',
  ticket: 'M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 0 1 0 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 0 1 0-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375Z',
  cash: 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z',
  expand: 'M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15',
  link: 'M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 000 6.364',
  chevronLeft: 'M15.75 19.5 8.25 12l7.5-7.5',
  chevronRight: 'M8.25 4.5l7.5 7.5-7.5 7.5',
  chevronDown: 'M19.5 8.25 12 15.75 4.5 8.25',
  chevronUp: 'M4.5 15.75 12 8.25l7.5 7.5',
  'arrow-down': 'M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3',
  // SAVING A PHOTO IS NOT "SCROLL DOWN" (2 Sep 2026).
  //
  // Ethan, of the photo bar: "I don't really like the download icon, I think
  // you can improve it" - with a picture of the one everybody draws: a short
  // arrow dropping INTO a tray. `arrow-down` is a full-height bare arrow, which
  // is the glyph for "go down the page", and next to Full screen and Reply it
  // read as a direction rather than as an action. The tray is the whole
  // difference: an arrow with somewhere to land is a download.
  download: 'M12 3.75v10.5m0 0 4.25-4.25M12 14.25 7.75 10M4.5 16.5v2.25A1.75 1.75 0 0 0 6.25 20.5h11.5a1.75 1.75 0 0 0 1.75-1.75V16.5',
  heart: 'M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z',
  trash: 'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0',
  smile: 'M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z',
  bell: 'M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0',
  clock: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
  mute: 'M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.506-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z',
  key: 'M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z',
  star: 'M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z',
  ban: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636',
  // Plain X, for clearing a field or dismissing a chip (`ban` is the circle-slash
  // "not allowed" mark and reads wrong as a clear button).
  close: 'M6 18L18 6M6 6l12 12',
  // A bucket, for the travel bucket list. A tapered body under a rim, with the
  // handle arcing over it - the handle is the whole recognition, because a
  // tapered box on its own is a plant pot.
  bucket: 'M4.2 8.2h15.6l-1.5 11.1a2 2 0 0 1-2 1.7H7.7a2 2 0 0 1-2-1.7L4.2 8.2Zm3.6 0a4.2 4.2 0 0 1 8.4 0',
  check: 'M9 12.75 11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  // Circle-exclamation, for inline form errors and warnings.
  alert: 'M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z',
  grip: 'M9 5.25h.008v.008H9V5.25zm0 6.75h.008v.008H9V12zm0 6.75h.008v.008H9v-.008zM15 5.25h.008v.008H15V5.25zm0 6.75h.008v.008H15V12zm0 6.75h.008v.008H15v-.008z',
  // "bug-ant" - used for bug reports.
  bug: 'M12 12.75c1.148 0 2.278.08 3.383.237 1.037.146 1.866.966 1.866 2.013 0 3.728-2.35 6.75-5.25 6.75S6.75 18.728 6.75 15c0-1.047.83-1.867 1.866-2.013A24.224 24.224 0 0112 12.75Zm0 0c2.883 0 5.647.508 8.207 1.44a23.91 23.91 0 01-1.152 6.06M12 12.75c-2.883 0-5.647.508-8.208 1.44.125 2.104.52 4.136 1.153 6.06M12 12.75a2.25 2.25 0 002.248-2.354M12 12.75a2.25 2.25 0 01-2.248-2.354M12 8.25c.995 0 1.971-.08 2.922-.236.403-.066.74-.358.795-.762a3.778 3.778 0 00-.399-2.25M12 8.25c-.995 0-1.97-.08-2.922-.236-.402-.066-.74-.358-.795-.762a3.734 3.734 0 01.4-2.253M12 8.25a2.25 2.25 0 00-2.248 2.146M12 8.25a2.25 2.25 0 012.248 2.146M8.683 5a6.032 6.032 0 01-1.155-1.002c-.31-.38-.74-.62-1.222-.679m9.222 1.68a6.032 6.032 0 001.155-1.002c.31-.38.74-.62 1.222-.679m-7.063 9.279a25.39 25.39 0 011.5-.062 25.39 25.39 0 011.5.062',
  reply: 'M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3',
  // "clipboard-document" - copy to clipboard.
  copy: 'M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184',
  // "sun" - light theme.
  sun: 'M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z',
  // "moon" - dark theme.
  moon: 'M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z',
  // "computer-desktop" - match system theme.
  device: 'M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 12V5.25',
  // "wallet" - payment details.
  wallet: 'M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3',
  // "ellipsis-horizontal" - an overflow menu. The only honest label for a group
  // of actions that have nothing in common except being rare.
  dots: 'M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM12.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM18.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z',
  // "arrow-right-on-rectangle" - leaving somewhere.
  exit: 'M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75',
  // "arrows-up-down" - drag to reorder a list.
  reorder: 'M3 7.5 7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5',
  // "plus" - add one more of something.
  plus: 'M12 4.5v15m7.5-7.5h-15',
  // "snowflake" - a streak freeze.
  snowflake: 'M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9M12 6.5 9.6 4.4M12 6.5l2.4-2.1M12 17.5l-2.4 2.1M12 17.5l2.4 2.1M6.9 9.6 4 9.2M6.9 9.6 5.6 6.9M17.1 14.4l2.9.4M17.1 14.4l1.3 2.7M17.1 9.6l1.3-2.7M17.1 9.6l2.9-.4M6.9 14.4l-1.3 2.7M6.9 14.4l-2.9.4',
  // "sparkles" - a suggestion the product made rather than the user asked for.
  sparkles: 'M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z',
}

// Layered icons: glyphs drawn with their own stroke weights (heavier than the
// default outline set). `magnifier` is the Guess the Country mark - a bold
// magnifying glass with a glint inside the lens.
const LAYERED_PATHS = {
  // A HAND THAT IS ACTUALLY WAVING (1 Sep 2026).
  //
  // Ethan: "I want the introductions icon changed to this one I attached but
  // with the custom colour and design, this is a more wave like icon."
  //
  // What it was: Heroicons' `hand-raised` - a good, clean open hand, and a
  // completely STILL one. At 18px in a tab strip a raised palm reads as "stop"
  // at least as readily as "hello", which is the wrong half of the meaning for
  // a room called Introductions.
  //
  // What makes it a wave is the MOTION LINES, not a different hand: two pairs
  // of arcs radiating off opposite corners, which is the shape everybody
  // already reads as movement. The hand keeps its own drawing, shrunk to make
  // room and leaned twelve degrees so it is caught mid-swing rather than held
  // up straight.
  //
  // It takes `currentColor` like every other glyph here, so the room list's
  // brand orange applies unchanged.
  // THE HAND IS THE ICON, AND IT FILLS THE BOX (2 Sep 2026).
  //
  // Ethan: "I like the new introductions icon you made, but it seems a bit
  // small - make it slightly bigger so the hand is much more the size of the
  // other icons, because currently it looks out of place. And just have the
  // waving hand tilted, remove the two lines on either side of it, because then
  // it would fit in better with the design."
  //
  // Both halves of that are one fault. The four motion flourishes lived at the
  // CORNERS of the 24-unit box, so the hand had to be shrunk to 0.72 to leave
  // room for them - which is why a 20px glyph next to a 20px chat bubble looked
  // like a 14px one. Take the flourishes away and the hand can have the box:
  // 0.94, which is as large as the artwork goes before the fingertips clip.
  //
  // The lean stays. It is what says "waving" now that nothing else does, and it
  // is one line rather than four extra strokes competing with a room list of
  // plain outlines. The stroke is pre-divided by the scale so it lands back on
  // the set's own 1.7 rather than being thinned by the transform.
  wave: [
    {
      d: 'M10.05 4.575a1.575 1.575 0 10-3.15 0v3m3.15-3v-1.5a1.575 1.575 0 013.15 0v1.5m-3.15 0l.075 5.925m3.075.75V4.575m0 0a1.575 1.575 0 013.15 0V15M6.9 7.575a1.575 1.575 0 10-3.15 0v8.175a6.75 6.75 0 006.75 6.75h2.018a5.25 5.25 0 003.712-1.538l1.732-1.732a5.25 5.25 0 001.538-3.712l.003-2.024a.668.668 0 01.198-.471 1.575 1.575 0 10-2.228-2.228 3.818 3.818 0 00-1.12 2.687M6.9 7.575V12m6.27 4.318A4.49 4.49 0 0116.35 15m.002 0h-.002',
      transform: 'rotate(-12 11.6 12.7) translate(11.6 12.7) scale(0.94) translate(-11.6 -12.7)',
      strokeWidth: 1.81,
    },
  ],
  magnifier: [
    { d: 'M16.2 10.1a6.1 6.1 0 1 1-12.2 0 6.1 6.1 0 0 1 12.2 0z', strokeWidth: 2.5 },
    { d: 'M14.7 14.6l5.6 5.6', strokeWidth: 3.4 },
    { d: 'M7.3 9.1c.35-1.05 1.25-1.85 2.4-2.1', strokeWidth: 2.1 },
  ],
}

// Solid (filled) icons - the brand marks that don't work as thin outlines.
// `plane-tryp` is the Tryp plane silhouette used on the creator map and in
// Flight Path, nose up.
const FILLED_PATHS = {
  'plane-tryp': 'M12 1.55 C13.05 1.55 13.71 3.45 13.71 6.11 L13.71 7.82 L21.5 12.95 L21.5 14.95 L13.71 11.81 L13.71 16.75 L16.18 19.22 L16.18 20.74 L12 19.32 L7.82 20.74 L7.82 19.22 L10.29 16.75 L10.29 11.81 L2.5 14.95 L2.5 12.95 L10.29 7.82 L10.29 6.11 C10.29 3.45 10.95 1.55 12 1.55 Z',
  // `plane-flight` is the PLAIN one, and it exists because `plane-tryp` is a
  // brand mark. It is nose-up like its neighbour, so anything drawing a plane
  // travelling left to right rotates it 90 degrees. Slimmer fuselage, straighter
  // wings and a smaller tailplane than the Tryp silhouette - at 40px on a moving
  // element what reads is the outline, and these two have to be distinguishable
  // from each other or there was no point adding the second one.
  'plane-flight': 'M12 2 C12.62 2 13.06 3.15 13.06 4.7 L13.06 8.5 L21.6 13.5 L21.6 15.2 L13.06 12.7 L13.06 17.4 L15.7 19.5 L15.7 20.9 L12 19.8 L8.3 20.9 L8.3 19.5 L10.94 17.4 L10.94 12.7 L2.4 15.2 L2.4 13.5 L10.94 8.5 L10.94 4.7 C10.94 3.15 11.38 2 12 2 Z',
}

// THE WORLD, NOT A WIREFRAME.
//
// `globe` was Heroicons' globe-alt: a circle with three meridians and two
// parallels. Ethan: "I don't like how it currently is with all the lines, but
// rather actually show the world with the countries" - and he is right that a
// nav tab labelled Worldwide reading as a wireframe sphere says "geometry"
// where it should say "the planet".
//
// So: a stroked ring with the landmasses filled inside it. Two masses, the
// Americas on the left and Europe-Africa on the right, with the Atlantic
// between them - which is the arrangement everybody reads as "world" and the
// one the reference image uses. Simplified hard, because the whole thing is
// twenty pixels across and any more coastline is mud.
//
// CLIPPED TO THE RING, so no matter how the shapes are tweaked a coastline can
// never poke out through the edge of the planet. The clip id is fixed and every
// instance draws the same geometry, so repeated ids resolve identically.
function WorldIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <defs>
        <clipPath id="tryp-world-clip">
          <circle cx="12" cy="12" r="8.9" />
        </clipPath>
      </defs>
      {/* THE REAL COASTLINES, NOT A DRAWING OF SOME.
          Generated from the same world atlas the app's maps use
          (public/geo/countries-50m.json), projected orthographically - a real
          globe seen from 40W 15N, which puts the Americas on the left and
          Europe and Africa on the right with the Atlantic down the middle. See
          scripts/gen-world-icon.py to change the view or the detail; do not
          hand-edit the `d`.

          THE LAND IS STROKED AS WELL AS FILLED, and that is what makes it read
          as continents rather than as confetti. The atlas is COUNTRIES, so
          Africa arrives as fifty separate polygons, each simplified on its own
          - which leaves hairline white cracks along every shared border at the
          size this is actually drawn. Half a unit of stroke in the same colour
          closes the cracks and thickens the coast, so neighbours merge into the
          landmass they belong to. */}
      <g clipPath="url(#tryp-world-clip)">
        <path
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="0.8"
          strokeLinejoin="round"
          d="M7.9 13.9L8.8 13.4L9.1 14L10.2 13.6L10 14.5L12.7 15.2L11.9 17.4L10.8 17.8L10.3 18.8L8.9 16.2L7.1 15.4L7.5 13.8L7.9 13.9ZM8.4 7.2L9.1 7L7 8.8L6.7 9.9L6.2 8.9L5.1 9.3L4.6 7.4L6 5.6L7.5 6.5L7.4 7.5L8.4 7.2ZM6.9 4.8L8.9 3.6L8.7 4.4L9.9 4.5L8.2 5.2L8.3 6.3L9.5 5.1L10.5 6.5L7.4 7.5L7.5 6.5L6.1 5.6L6.9 4.8ZM17.4 8L18.5 9.8L17.9 10.8L16.1 9.6L17.4 8ZM9.6 18.3L9.9 19L9.1 19.3L9.1 20.1L8.1 18.3L8.2 17.3L10 17.8L9.6 18.3ZM16.1 11.8L15.5 11.7L15.3 10.9L16.2 9.8L16.7 10L16.9 11.5L16.1 11.8ZM12.2 3.6L13 4.5L11.7 5.6L10.9 3.9L12.2 3.6ZM4.6 7.7L5.1 8.6L4.9 10.4L5.9 10.3L5.1 11.2L4.3 10L4.6 7.7ZM17.9 8.9L17.9 8.4L19 8.2L19.7 10.1L18.3 9.7L17.9 8.9ZM16.2 12.1L16.2 11.6L16.9 11.5L16.5 10.1L18 10.7L17 12.3L16.2 12.1ZM7.4 12.2L7.1 12.5L7.9 13.9L7.5 13.8L7.5 14.7L6.3 13.6L6.6 12.5L7.4 12.2ZM7.7 16.6L7.6 15.7L8.2 15.6L9.4 17.1L8.1 17.3L7.7 16.6ZM7.5 14.7L7 15.1L7.8 15.9L7.7 16.7L6 14.4L6.8 13.9L7.5 14.7ZM8.9 12.9L8.1 14L7.1 12.5L7.6 12.1L8.9 12.9ZM16.9 4.4L18.8 6.3L14.5 3.4L15.4 3.6L13 3L15 3.5ZM20.5 14L20.2 14.8L19.9 14.2L19.1 14.3L20.3 12.1L20.5 14ZM19.1 11.3L18.1 11.9L17.7 11.5L18.5 9.8L19.1 11.3ZM19.7 10.1L19.9 11.4L19.4 12.2L18.8 9.8L19.7 10.1ZM20 14.7L19.7 15.6L18.8 16L19.1 14.4L19.9 14.2L20 14.7ZM20.6 11.2L20.5 10.8L20 11.7L19.8 11.1L19.6 9.6L20.2 9.2L20.6 11.2ZM7.7 16.7L9.2 20.2L8 18.9L7.7 16.7ZM16.5 8.5L16.8 8.9L15.3 10.8L16.1 8.5L16.5 8.5Z"
        />
      </g>
      {/* A HEAVY RING. The planet's edge is the one line that has to survive
          being 20px wide in a tab bar; at the 1.7 the rest of the icon set uses
          it read as a hairline round a busy middle. */}
      <circle cx="12" cy="12" r="8.9" stroke="currentColor" strokeWidth="2.1" />
    </svg>
  )
}

export default function Icon({ name, className = 'h-5 w-5', strokeWidth = 1.7 }) {
  if (name === 'globe') return <WorldIcon className={className} />
  const layered = LAYERED_PATHS[name]
  if (layered) {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        {layered.map((p, i) => (
          // `transform` is optional and per PATH: the wave scales and leans its
          // hand while leaving its motion arcs exactly where they were drawn.
          <path
            key={i}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={p.strokeWidth}
            transform={p.transform}
            d={p.d}
          />
        ))}
      </svg>
    )
  }
  const filled = FILLED_PATHS[name]
  if (filled) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path strokeLinejoin="round" d={filled} />
      </svg>
    )
  }
  const d = PATHS[name]
  if (!d) return null
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={strokeWidth} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  )
}
