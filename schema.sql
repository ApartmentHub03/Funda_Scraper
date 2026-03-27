-- Run this in Supabase SQL Editor
-- drop table if exists properties;

create table properties (
  id uuid default gen_random_uuid() primary key,

  -- Core identity
  external_id text unique,
  global_id bigint,
  url text,
  sharing_url text,
  status text,
  publication_date timestamptz,

  -- Type & category
  object_type text,
  offering_type text,
  is_sold_or_rented boolean default false,

  -- Description
  description text,

  -- Address (flattened)
  address_title text,
  address_subtitle text,
  street_name text,
  house_number text,
  postal_code text,
  city text,
  neighbourhood text,
  province text,
  country text,
  latitude double precision,
  longitude double precision,
  google_maps_link text,

  -- Pricing
  selling_price bigint,
  selling_price_display text,
  rental_price text,
  is_auction boolean default false,
  original_selling_price text,

  -- Dimensions
  living_area text,
  plot_area text,

  -- Rooms
  number_of_rooms int,
  number_of_bedrooms int,

  -- Energy
  energy_label text,

  -- Insights
  views text,
  saves text,

  -- Media
  photos text[],
  videos text[],
  photos360 text[],
  floor_plan text[],
  brochure_url text,
  photo_count int,

  -- Features (structured)
  features jsonb,

  -- Extracted features (flattened from features array for querying)
  build_year text,
  apartment_type text,
  construction_type text,
  roof_type text,
  num_bathrooms text,
  num_floors text,
  floor_level text,
  insulation text,
  heating text,
  parking text,
  outdoor_space text,
  storage text,
  vve_contribution text,
  ownership_status text,

  -- Metadata
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes
create index idx_properties_city on properties(city);
create index idx_properties_selling_price on properties(selling_price);
create index idx_properties_object_type on properties(object_type);
create index idx_properties_publication_date on properties(publication_date);
create index idx_properties_postal_code on properties(postal_code);
create index idx_properties_energy_label on properties(energy_label);
create index idx_properties_build_year on properties(build_year);
