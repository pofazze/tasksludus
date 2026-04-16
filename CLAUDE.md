## Notifications

The notification flow routes WhatsApp messages by client category. Set the
mapping once via the existing `PUT /api/settings/:key` endpoint (CEO-only):

```http
PUT /api/settings/category_whatsapp_groups
Content-Type: application/json

{
  "value": {
    "health": "120363425760405482@g.us",
    "experts": "<group jid here>"
  }
}
```

If the key is missing, or a client's category is not in the mapping, the
category-group leg is skipped silently and the rest of the flow still fires.
