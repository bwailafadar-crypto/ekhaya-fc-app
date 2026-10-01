import type { Handler } from '@netlify/functions'

const WORDPRESS_NEWS_URL = 'https://ekhayafc.com/wp-json/wp/v2/posts?per_page=10&_embed=true'

export const handler: Handler = async () => {
  try {
    const response = await fetch(WORDPRESS_NEWS_URL, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'EkhayaFC-App/1.0',
      },
    })

    const text = await response.text()
    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: {
          'content-type': 'application/json',
          'cache-control': 'no-store',
          'access-control-allow-origin': '*',
        },
        body: JSON.stringify({ error: 'News source is unavailable right now.' }),
      }
    }

    return {
      statusCode: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
      },
      body: text,
    }
  } catch {
    return {
      statusCode: 503,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
      },
      body: JSON.stringify({ error: 'News source could not be reached.' }),
    }
  }
}
