# Workshop Finder - MVP

Static web app for finding auto repair shops, tire shops, auto electricians, and similar businesses on Google Maps.

## How to try it

Open `index.html` in the browser and enter a Google Maps API key.

The key must have these APIs enabled:

- Maps JavaScript API
- Places API (New)

Geocoding API is not required for this MVP: city lookup and business search use Places API (New).

For security, restrict the key in Google Cloud to the domains or URLs where you will use the app.

## What it does

- quickly moves the map to a country and city
- shows a draggable and editable circular search area
- searches by keyword around the selected area
- shows name, address, phone, website, and Google Maps link when available
- exports results to CSV

## Email note

Google Places does not normally return a business email address. A later enrichment step can try to extract email addresses from business websites, with technical and legal limits to evaluate.
