import "dotenv/config";
import axios from "axios";
import { createClient } from "@supabase/supabase-js";

// Always fetch the latest run's dataset — no hardcoded dataset ID
const APIFY_URL = `https://api.apify.com/v2/acts/${process.env.APIFY_ACTOR}/runs/last/dataset/items?format=json&clean=true&token=${process.env.APIFY_TOKEN}`;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Helper: extract a specific subfeature value from the features array
function getFeature(features, sectionTitle, featureTitle) {
  if (!features) return null;
  const section = features.find((f) => f.title === sectionTitle);
  if (!section?.subfeatures) return null;
  const feat = section.subfeatures.find((f) => f.title === featureTitle);
  return feat?.value ?? null;
}

// Helper: extract nested subfeature (e.g. Oppervlakten > Gebruiksoppervlakten > Wonen)
function getNestedFeature(features, sectionTitle, subTitle, featureTitle) {
  if (!features) return null;
  const section = features.find((f) => f.title === sectionTitle);
  if (!section?.subfeatures) return null;
  const sub = section.subfeatures.find((f) => f.title === subTitle);
  if (!sub?.subfeatures) return null;
  const feat = sub.subfeatures.find((f) => f.title === featureTitle);
  return feat?.value ?? null;
}

function transform(item) {
  const f = item.features;

  return {
    // Core identity
    external_id: item.id ?? null,
    global_id: item.global_id ?? null,
    url: item.url ?? null,
    sharing_url: item.sharing_url ?? null,
    status: getFeature(f, "Overdracht", "Status") ?? null,
    publication_date: item.publication_date ?? null,

    // Type & category
    object_type: item.object_type ?? null,
    offering_type: item.offering_type ?? null,
    is_sold_or_rented: item.is_sold_or_rented ?? false,

    // Description
    description: item.description ?? null,

    // Address
    address_title: item.address?.title ?? null,
    address_subtitle: item.address?.subtitle ?? null,
    house_number: item.address?.house_number ?? null,
    postal_code: item.address?.postcode ?? null,
    city: item.address?.city ?? null,
    neighbourhood: item.address?.neighborhood ?? null,
    province: item.address?.province ?? null,
    country: item.address?.country ?? null,
    latitude: item.address?.latitude ?? null,
    longitude: item.address?.longitude ?? null,
    google_maps_link: item.address?.google_maps_link ?? null,

    // Pricing
    selling_price: item.price_info?.numeric_price ?? null,
    selling_price_display: item.price_info?.selling_price ?? null,
    rental_price: item.price_info?.rental_price ?? null,
    is_auction: item.price_info?.is_auction ?? false,
    original_selling_price: item.price_info?.original_selling_price ?? null,

    // Dimensions
    living_area: item.living_area ?? null,
    plot_area: item.plot_area ?? null,

    // Rooms
    number_of_rooms: item.number_of_rooms ?? null,
    number_of_bedrooms: item.number_of_bedrooms ?? null,

    // Energy
    energy_label: item.energy_label ?? null,

    // Insights
    views: item.insights?.views ?? null,
    saves: item.insights?.saves ?? null,

    // Media
    photos: item.photos ?? null,
    videos: item.videos ?? null,
    photos360: item.photos360 ?? null,
    floor_plan: item.floor_plan ?? null,
    brochure_url: item.brochure_url ?? null,
    photo_count: item.photos?.length ?? 0,

    // Full features as JSON (for anything we didn't flatten)
    features: f ?? null,

    // Extracted features (flattened for easy querying)
    build_year: getFeature(f, "Bouw", "Bouwjaar"),
    apartment_type: getFeature(f, "Bouw", "Soort appartement"),
    construction_type: getFeature(f, "Bouw", "Soort bouw"),
    roof_type: getFeature(f, "Bouw", "Soort dak"),
    num_bathrooms: getFeature(f, "Indeling", "Aantal badkamers"),
    num_floors: getFeature(f, "Indeling", "Aantal woonlagen"),
    floor_level: getFeature(f, "Indeling", "Gelegen op"),
    insulation: getFeature(f, "Energie", "Isolatie"),
    heating: getFeature(f, "Energie", "Verwarming"),
    parking: getFeature(f, "Parkeergelegenheid", "Soort parkeergelegenheid"),
    outdoor_space: getFeature(f, "Buitenruimte", "Balkon/dakterras"),
    storage: getFeature(f, "Bergruimte", "Schuur/berging"),
    vve_contribution: getFeature(f, "VvE checklist", "Periodieke bijdrage"),
    ownership_status:
      getNestedFeature(f, "Kadastrale gegevens", f?.find((s) => s.title === "Kadastrale gegevens")?.subfeatures?.[0]?.title, "Eigendomssituatie"),
  };
}

async function fetchExistingIds() {
  // Fetch all external_ids currently in Supabase
  const allIds = [];
  let from = 0;
  const PAGE_SIZE = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("properties")
      .select("external_id")
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error("Error fetching existing IDs:", error.message);
      throw error;
    }

    allIds.push(...data.map((row) => row.external_id));

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return new Set(allIds);
}

async function syncData() {
  console.log("Fetching latest dataset from Apify...");
  const { data } = await axios.get(APIFY_URL);
  console.log(`Fetched ${data.length} items from latest run`);

  const cleaned = data.map(transform).filter((item) => item.external_id);
  console.log(`${cleaned.length} valid items after transform`);

  // Get existing IDs from Supabase
  console.log("Fetching existing apartment IDs from Supabase...");
  const existingIds = await fetchExistingIds();
  console.log(`Found ${existingIds.size} existing apartments in database`);

  // Filter to only NEW apartments
  const newApartments = cleaned.filter(
    (item) => !existingIds.has(item.external_id)
  );
  console.log(`${newApartments.length} new apartments to insert`);

  if (newApartments.length === 0) {
    console.log("No new apartments found. Done.");
    return;
  }

  // Insert in batches of 200
  const BATCH_SIZE = 200;
  let inserted = 0;
  let failed = 0;

  for (let i = 0; i < newApartments.length; i += BATCH_SIZE) {
    const batch = newApartments.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("properties").insert(batch);

    if (error) {
      console.error(
        `Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`,
        error.message
      );
      failed += batch.length;
    } else {
      inserted += batch.length;
    }
  }

  console.log(
    `Done: ${inserted} new apartments inserted, ${failed} failed`
  );
}

syncData();
