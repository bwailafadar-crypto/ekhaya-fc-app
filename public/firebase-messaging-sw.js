/* Ekhaya FC alerts worker. Shows push notifications sent by the club's server
   functions while the app is closed or in the background. The Firebase web
   config arrives in the registration URL, so this file never needs editing. */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js')

const params = new URL(self.location.href).searchParams
firebase.initializeApp({
  apiKey: params.get('apiKey'),
  projectId: params.get('projectId'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
})

// Notifications sent with a "notification" payload are displayed automatically;
// initialising messaging is what enables that.
firebase.messaging()
// Tapping a notification opens its link (fcmOptions.link); the messaging
// library handles that itself.
