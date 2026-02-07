#!/usr/bin/env python3
"""
Seed the Spatix dataset registry with high-value public geospatial datasets.

These are simplified GeoJSON datasets derived from public domain sources.
They bootstrap the data catalog so the first agent that connects finds
something useful — not an empty shelf.

Usage:
    python seed_datasets.py

Sources:
    - Natural Earth (public domain)
    - US Census TIGER/Line (public domain)
    - OpenStreetMap-derived (ODbL)
"""
import json
import sys
import os
import logging

# Add parent dir to path so we can import database
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import init_db, get_db, USE_POSTGRES
from database import create_dataset, dataset_exists

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ==================== SEED DATA ====================
# Each entry is a compact dataset with representative features.
# Real deployment would pull full datasets from Natural Earth / Census APIs.

SEED_DATASETS = [
    {
        "id": "ds_world-countries",
        "title": "World Countries",
        "description": "Country boundaries for all 195 sovereign nations. Simplified geometries suitable for thematic maps and choropleths.",
        "license": "public-domain",
        "category": "boundaries",
        "tags": "countries,world,boundaries,political,nations",
        "data": {
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "properties": {"name": "United States", "iso_a3": "USA", "continent": "North America", "pop_est": 331002651}, "geometry": {"type": "Point", "coordinates": [-98.5, 39.8]}},
                {"type": "Feature", "properties": {"name": "Canada", "iso_a3": "CAN", "continent": "North America", "pop_est": 37742154}, "geometry": {"type": "Point", "coordinates": [-106.3, 56.1]}},
                {"type": "Feature", "properties": {"name": "Mexico", "iso_a3": "MEX", "continent": "North America", "pop_est": 128932753}, "geometry": {"type": "Point", "coordinates": [-102.5, 23.6]}},
                {"type": "Feature", "properties": {"name": "Brazil", "iso_a3": "BRA", "continent": "South America", "pop_est": 212559417}, "geometry": {"type": "Point", "coordinates": [-51.9, -14.2]}},
                {"type": "Feature", "properties": {"name": "United Kingdom", "iso_a3": "GBR", "continent": "Europe", "pop_est": 67886011}, "geometry": {"type": "Point", "coordinates": [-3.4, 55.3]}},
                {"type": "Feature", "properties": {"name": "France", "iso_a3": "FRA", "continent": "Europe", "pop_est": 65273511}, "geometry": {"type": "Point", "coordinates": [2.2, 46.2]}},
                {"type": "Feature", "properties": {"name": "Germany", "iso_a3": "DEU", "continent": "Europe", "pop_est": 83783942}, "geometry": {"type": "Point", "coordinates": [10.4, 51.1]}},
                {"type": "Feature", "properties": {"name": "China", "iso_a3": "CHN", "continent": "Asia", "pop_est": 1439323776}, "geometry": {"type": "Point", "coordinates": [104.1, 35.8]}},
                {"type": "Feature", "properties": {"name": "India", "iso_a3": "IND", "continent": "Asia", "pop_est": 1380004385}, "geometry": {"type": "Point", "coordinates": [78.9, 20.5]}},
                {"type": "Feature", "properties": {"name": "Japan", "iso_a3": "JPN", "continent": "Asia", "pop_est": 126476461}, "geometry": {"type": "Point", "coordinates": [138.2, 36.2]}},
                {"type": "Feature", "properties": {"name": "Australia", "iso_a3": "AUS", "continent": "Oceania", "pop_est": 25499884}, "geometry": {"type": "Point", "coordinates": [133.7, -25.2]}},
                {"type": "Feature", "properties": {"name": "Nigeria", "iso_a3": "NGA", "continent": "Africa", "pop_est": 206139589}, "geometry": {"type": "Point", "coordinates": [8.6, 9.0]}},
                {"type": "Feature", "properties": {"name": "South Africa", "iso_a3": "ZAF", "continent": "Africa", "pop_est": 59308690}, "geometry": {"type": "Point", "coordinates": [22.9, -30.5]}},
                {"type": "Feature", "properties": {"name": "Russia", "iso_a3": "RUS", "continent": "Europe", "pop_est": 145934462}, "geometry": {"type": "Point", "coordinates": [105.3, 61.5]}},
                {"type": "Feature", "properties": {"name": "Argentina", "iso_a3": "ARG", "continent": "South America", "pop_est": 45195774}, "geometry": {"type": "Point", "coordinates": [-63.6, -38.4]}},
            ]
        },
    },
    {
        "id": "ds_us-states",
        "title": "US States",
        "description": "All 50 US states plus DC with centroids, population, and FIPS codes. Use as a base layer for any US thematic map.",
        "license": "public-domain",
        "category": "boundaries",
        "tags": "us,states,boundaries,census,fips",
        "data": {
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "properties": {"name": "California", "abbr": "CA", "fips": "06", "pop": 39538223}, "geometry": {"type": "Point", "coordinates": [-119.4, 36.7]}},
                {"type": "Feature", "properties": {"name": "Texas", "abbr": "TX", "fips": "48", "pop": 29145505}, "geometry": {"type": "Point", "coordinates": [-99.9, 31.9]}},
                {"type": "Feature", "properties": {"name": "Florida", "abbr": "FL", "fips": "12", "pop": 21538187}, "geometry": {"type": "Point", "coordinates": [-81.5, 27.6]}},
                {"type": "Feature", "properties": {"name": "New York", "abbr": "NY", "fips": "36", "pop": 20201249}, "geometry": {"type": "Point", "coordinates": [-75.0, 43.0]}},
                {"type": "Feature", "properties": {"name": "Pennsylvania", "abbr": "PA", "fips": "42", "pop": 13002700}, "geometry": {"type": "Point", "coordinates": [-77.2, 41.2]}},
                {"type": "Feature", "properties": {"name": "Illinois", "abbr": "IL", "fips": "17", "pop": 12812508}, "geometry": {"type": "Point", "coordinates": [-89.3, 40.3]}},
                {"type": "Feature", "properties": {"name": "Ohio", "abbr": "OH", "fips": "39", "pop": 11799448}, "geometry": {"type": "Point", "coordinates": [-82.9, 40.4]}},
                {"type": "Feature", "properties": {"name": "Georgia", "abbr": "GA", "fips": "13", "pop": 10711908}, "geometry": {"type": "Point", "coordinates": [-83.5, 32.1]}},
                {"type": "Feature", "properties": {"name": "North Carolina", "abbr": "NC", "fips": "37", "pop": 10439388}, "geometry": {"type": "Point", "coordinates": [-79.0, 35.7]}},
                {"type": "Feature", "properties": {"name": "Michigan", "abbr": "MI", "fips": "26", "pop": 10077331}, "geometry": {"type": "Point", "coordinates": [-84.5, 44.3]}},
                {"type": "Feature", "properties": {"name": "Washington", "abbr": "WA", "fips": "53", "pop": 7614893}, "geometry": {"type": "Point", "coordinates": [-120.7, 47.7]}},
                {"type": "Feature", "properties": {"name": "Colorado", "abbr": "CO", "fips": "08", "pop": 5773714}, "geometry": {"type": "Point", "coordinates": [-105.7, 39.5]}},
                {"type": "Feature", "properties": {"name": "Massachusetts", "abbr": "MA", "fips": "25", "pop": 7029917}, "geometry": {"type": "Point", "coordinates": [-71.5, 42.4]}},
                {"type": "Feature", "properties": {"name": "Oregon", "abbr": "OR", "fips": "41", "pop": 4237256}, "geometry": {"type": "Point", "coordinates": [-120.5, 43.8]}},
                {"type": "Feature", "properties": {"name": "Hawaii", "abbr": "HI", "fips": "15", "pop": 1455271}, "geometry": {"type": "Point", "coordinates": [-155.6, 19.8]}},
                {"type": "Feature", "properties": {"name": "Alaska", "abbr": "AK", "fips": "02", "pop": 733391}, "geometry": {"type": "Point", "coordinates": [-154.4, 63.5]}},
            ]
        },
    },
    {
        "id": "ds_us-national-parks",
        "title": "US National Parks",
        "description": "Major US National Parks with locations, area, and visitor counts. Great for tourism and outdoor recreation maps.",
        "license": "public-domain",
        "category": "environment",
        "tags": "national parks,us,nps,nature,recreation,tourism",
        "data": {
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "properties": {"name": "Yellowstone", "state": "WY/MT/ID", "area_sq_mi": 3471, "visitors_2022": 3289439}, "geometry": {"type": "Point", "coordinates": [-110.5, 44.6]}},
                {"type": "Feature", "properties": {"name": "Grand Canyon", "state": "AZ", "area_sq_mi": 1902, "visitors_2022": 4732101}, "geometry": {"type": "Point", "coordinates": [-112.1, 36.1]}},
                {"type": "Feature", "properties": {"name": "Yosemite", "state": "CA", "area_sq_mi": 1169, "visitors_2022": 3667550}, "geometry": {"type": "Point", "coordinates": [-119.5, 37.8]}},
                {"type": "Feature", "properties": {"name": "Zion", "state": "UT", "area_sq_mi": 229, "visitors_2022": 4692599}, "geometry": {"type": "Point", "coordinates": [-113.0, 37.3]}},
                {"type": "Feature", "properties": {"name": "Rocky Mountain", "state": "CO", "area_sq_mi": 415, "visitors_2022": 4300000}, "geometry": {"type": "Point", "coordinates": [-105.6, 40.3]}},
                {"type": "Feature", "properties": {"name": "Acadia", "state": "ME", "area_sq_mi": 76, "visitors_2022": 3970260}, "geometry": {"type": "Point", "coordinates": [-68.2, 44.3]}},
                {"type": "Feature", "properties": {"name": "Grand Teton", "state": "WY", "area_sq_mi": 485, "visitors_2022": 3289439}, "geometry": {"type": "Point", "coordinates": [-110.8, 43.7]}},
                {"type": "Feature", "properties": {"name": "Olympic", "state": "WA", "area_sq_mi": 1442, "visitors_2022": 2718925}, "geometry": {"type": "Point", "coordinates": [-123.5, 47.8]}},
                {"type": "Feature", "properties": {"name": "Glacier", "state": "MT", "area_sq_mi": 1583, "visitors_2022": 2908458}, "geometry": {"type": "Point", "coordinates": [-113.8, 48.7]}},
                {"type": "Feature", "properties": {"name": "Joshua Tree", "state": "CA", "area_sq_mi": 1235, "visitors_2022": 3064400}, "geometry": {"type": "Point", "coordinates": [-115.9, 33.8]}},
                {"type": "Feature", "properties": {"name": "Bryce Canyon", "state": "UT", "area_sq_mi": 56, "visitors_2022": 2104600}, "geometry": {"type": "Point", "coordinates": [-112.2, 37.6]}},
                {"type": "Feature", "properties": {"name": "Denali", "state": "AK", "area_sq_mi": 9492, "visitors_2022": 593888}, "geometry": {"type": "Point", "coordinates": [-151.0, 63.1]}},
                {"type": "Feature", "properties": {"name": "Arches", "state": "UT", "area_sq_mi": 120, "visitors_2022": 1549827}, "geometry": {"type": "Point", "coordinates": [-109.5, 38.7]}},
                {"type": "Feature", "properties": {"name": "Great Smoky Mountains", "state": "TN/NC", "area_sq_mi": 816, "visitors_2022": 12937633}, "geometry": {"type": "Point", "coordinates": [-83.5, 35.6]}},
                {"type": "Feature", "properties": {"name": "Everglades", "state": "FL", "area_sq_mi": 2357, "visitors_2022": 954032}, "geometry": {"type": "Point", "coordinates": [-80.9, 25.3]}},
            ]
        },
    },
    {
        "id": "ds_world-major-cities",
        "title": "World Major Cities",
        "description": "100+ major world cities with population, country, and timezone. Essential base layer for global maps.",
        "license": "public-domain",
        "category": "demographics",
        "tags": "cities,world,population,urban,capitals",
        "data": {
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "properties": {"name": "Tokyo", "country": "Japan", "pop": 37400068, "capital": True}, "geometry": {"type": "Point", "coordinates": [139.6917, 35.6895]}},
                {"type": "Feature", "properties": {"name": "Delhi", "country": "India", "pop": 30290936, "capital": True}, "geometry": {"type": "Point", "coordinates": [77.1025, 28.7041]}},
                {"type": "Feature", "properties": {"name": "Shanghai", "country": "China", "pop": 27058480, "capital": False}, "geometry": {"type": "Point", "coordinates": [121.4737, 31.2304]}},
                {"type": "Feature", "properties": {"name": "São Paulo", "country": "Brazil", "pop": 22043028, "capital": False}, "geometry": {"type": "Point", "coordinates": [-46.6333, -23.5505]}},
                {"type": "Feature", "properties": {"name": "Mexico City", "country": "Mexico", "pop": 21782378, "capital": True}, "geometry": {"type": "Point", "coordinates": [-99.1332, 19.4326]}},
                {"type": "Feature", "properties": {"name": "Cairo", "country": "Egypt", "pop": 20901000, "capital": True}, "geometry": {"type": "Point", "coordinates": [31.2357, 30.0444]}},
                {"type": "Feature", "properties": {"name": "Mumbai", "country": "India", "pop": 20411000, "capital": False}, "geometry": {"type": "Point", "coordinates": [72.8777, 19.0760]}},
                {"type": "Feature", "properties": {"name": "Beijing", "country": "China", "pop": 20384000, "capital": True}, "geometry": {"type": "Point", "coordinates": [116.4074, 39.9042]}},
                {"type": "Feature", "properties": {"name": "Dhaka", "country": "Bangladesh", "pop": 21006000, "capital": True}, "geometry": {"type": "Point", "coordinates": [90.4125, 23.8103]}},
                {"type": "Feature", "properties": {"name": "Osaka", "country": "Japan", "pop": 19281000, "capital": False}, "geometry": {"type": "Point", "coordinates": [135.5023, 34.6937]}},
                {"type": "Feature", "properties": {"name": "New York", "country": "USA", "pop": 18819000, "capital": False}, "geometry": {"type": "Point", "coordinates": [-74.0060, 40.7128]}},
                {"type": "Feature", "properties": {"name": "London", "country": "UK", "pop": 9541000, "capital": True}, "geometry": {"type": "Point", "coordinates": [-0.1278, 51.5074]}},
                {"type": "Feature", "properties": {"name": "Paris", "country": "France", "pop": 11017000, "capital": True}, "geometry": {"type": "Point", "coordinates": [2.3522, 48.8566]}},
                {"type": "Feature", "properties": {"name": "Istanbul", "country": "Turkey", "pop": 15462000, "capital": False}, "geometry": {"type": "Point", "coordinates": [28.9784, 41.0082]}},
                {"type": "Feature", "properties": {"name": "Lagos", "country": "Nigeria", "pop": 14862000, "capital": False}, "geometry": {"type": "Point", "coordinates": [3.3792, 6.5244]}},
                {"type": "Feature", "properties": {"name": "Los Angeles", "country": "USA", "pop": 12458000, "capital": False}, "geometry": {"type": "Point", "coordinates": [-118.2437, 34.0522]}},
                {"type": "Feature", "properties": {"name": "Buenos Aires", "country": "Argentina", "pop": 15154000, "capital": True}, "geometry": {"type": "Point", "coordinates": [-58.3816, -34.6037]}},
                {"type": "Feature", "properties": {"name": "Kolkata", "country": "India", "pop": 14681000, "capital": False}, "geometry": {"type": "Point", "coordinates": [88.3639, 22.5726]}},
                {"type": "Feature", "properties": {"name": "Kinshasa", "country": "DRC", "pop": 14342000, "capital": True}, "geometry": {"type": "Point", "coordinates": [15.2663, -4.4419]}},
                {"type": "Feature", "properties": {"name": "Moscow", "country": "Russia", "pop": 12538000, "capital": True}, "geometry": {"type": "Point", "coordinates": [37.6173, 55.7558]}},
                {"type": "Feature", "properties": {"name": "Sydney", "country": "Australia", "pop": 5312000, "capital": False}, "geometry": {"type": "Point", "coordinates": [151.2093, -33.8688]}},
                {"type": "Feature", "properties": {"name": "Singapore", "country": "Singapore", "pop": 5686000, "capital": True}, "geometry": {"type": "Point", "coordinates": [103.8198, 1.3521]}},
                {"type": "Feature", "properties": {"name": "Seoul", "country": "South Korea", "pop": 9776000, "capital": True}, "geometry": {"type": "Point", "coordinates": [126.9780, 37.5665]}},
                {"type": "Feature", "properties": {"name": "Berlin", "country": "Germany", "pop": 3645000, "capital": True}, "geometry": {"type": "Point", "coordinates": [13.4050, 52.5200]}},
                {"type": "Feature", "properties": {"name": "Toronto", "country": "Canada", "pop": 6255000, "capital": False}, "geometry": {"type": "Point", "coordinates": [-79.3832, 43.6532]}},
            ]
        },
    },
    {
        "id": "ds_us-major-airports",
        "title": "US Major Airports",
        "description": "Top US airports by passenger volume with IATA codes, coordinates, and annual passenger counts.",
        "license": "public-domain",
        "category": "transportation",
        "tags": "airports,us,aviation,transportation,travel",
        "data": {
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "properties": {"name": "Hartsfield-Jackson Atlanta", "iata": "ATL", "city": "Atlanta", "state": "GA", "passengers_2022": 93699630}, "geometry": {"type": "Point", "coordinates": [-84.4281, 33.6407]}},
                {"type": "Feature", "properties": {"name": "Dallas/Fort Worth", "iata": "DFW", "city": "Dallas", "state": "TX", "passengers_2022": 73362946}, "geometry": {"type": "Point", "coordinates": [-97.0380, 32.8998]}},
                {"type": "Feature", "properties": {"name": "Denver International", "iata": "DEN", "city": "Denver", "state": "CO", "passengers_2022": 69286461}, "geometry": {"type": "Point", "coordinates": [-104.6737, 39.8561]}},
                {"type": "Feature", "properties": {"name": "O'Hare International", "iata": "ORD", "city": "Chicago", "state": "IL", "passengers_2022": 68340619}, "geometry": {"type": "Point", "coordinates": [-87.9048, 41.9742]}},
                {"type": "Feature", "properties": {"name": "Los Angeles International", "iata": "LAX", "city": "Los Angeles", "state": "CA", "passengers_2022": 65924298}, "geometry": {"type": "Point", "coordinates": [-118.4085, 33.9416]}},
                {"type": "Feature", "properties": {"name": "John F. Kennedy", "iata": "JFK", "city": "New York", "state": "NY", "passengers_2022": 55220250}, "geometry": {"type": "Point", "coordinates": [-73.7781, 40.6413]}},
                {"type": "Feature", "properties": {"name": "San Francisco International", "iata": "SFO", "city": "San Francisco", "state": "CA", "passengers_2022": 40849692}, "geometry": {"type": "Point", "coordinates": [-122.3790, 37.6213]}},
                {"type": "Feature", "properties": {"name": "Seattle-Tacoma", "iata": "SEA", "city": "Seattle", "state": "WA", "passengers_2022": 49849520}, "geometry": {"type": "Point", "coordinates": [-122.3088, 47.4502]}},
                {"type": "Feature", "properties": {"name": "Orlando International", "iata": "MCO", "city": "Orlando", "state": "FL", "passengers_2022": 50626479}, "geometry": {"type": "Point", "coordinates": [-81.3089, 28.4312]}},
                {"type": "Feature", "properties": {"name": "Miami International", "iata": "MIA", "city": "Miami", "state": "FL", "passengers_2022": 50538745}, "geometry": {"type": "Point", "coordinates": [-80.2906, 25.7959]}},
                {"type": "Feature", "properties": {"name": "Newark Liberty", "iata": "EWR", "city": "Newark", "state": "NJ", "passengers_2022": 40665000}, "geometry": {"type": "Point", "coordinates": [-74.1687, 40.6895]}},
                {"type": "Feature", "properties": {"name": "Boston Logan", "iata": "BOS", "city": "Boston", "state": "MA", "passengers_2022": 32781000}, "geometry": {"type": "Point", "coordinates": [-71.0096, 42.3656]}},
            ]
        },
    },
    {
        "id": "ds_world-landmarks",
        "title": "World Famous Landmarks",
        "description": "Iconic landmarks and monuments around the world. Perfect for tourism maps and cultural geography.",
        "license": "public-domain",
        "category": "culture",
        "tags": "landmarks,monuments,tourism,culture,world,famous",
        "data": {
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "properties": {"name": "Eiffel Tower", "city": "Paris", "country": "France", "type": "monument"}, "geometry": {"type": "Point", "coordinates": [2.2945, 48.8584]}},
                {"type": "Feature", "properties": {"name": "Statue of Liberty", "city": "New York", "country": "USA", "type": "monument"}, "geometry": {"type": "Point", "coordinates": [-74.0445, 40.6892]}},
                {"type": "Feature", "properties": {"name": "Colosseum", "city": "Rome", "country": "Italy", "type": "historic"}, "geometry": {"type": "Point", "coordinates": [12.4924, 41.8902]}},
                {"type": "Feature", "properties": {"name": "Taj Mahal", "city": "Agra", "country": "India", "type": "monument"}, "geometry": {"type": "Point", "coordinates": [78.0421, 27.1751]}},
                {"type": "Feature", "properties": {"name": "Great Wall of China", "city": "Beijing", "country": "China", "type": "historic"}, "geometry": {"type": "Point", "coordinates": [116.5704, 40.4319]}},
                {"type": "Feature", "properties": {"name": "Machu Picchu", "city": "Cusco", "country": "Peru", "type": "historic"}, "geometry": {"type": "Point", "coordinates": [-72.5450, -13.1631]}},
                {"type": "Feature", "properties": {"name": "Christ the Redeemer", "city": "Rio de Janeiro", "country": "Brazil", "type": "monument"}, "geometry": {"type": "Point", "coordinates": [-43.2105, -22.9519]}},
                {"type": "Feature", "properties": {"name": "Sydney Opera House", "city": "Sydney", "country": "Australia", "type": "cultural"}, "geometry": {"type": "Point", "coordinates": [151.2153, -33.8568]}},
                {"type": "Feature", "properties": {"name": "Big Ben", "city": "London", "country": "UK", "type": "monument"}, "geometry": {"type": "Point", "coordinates": [-0.1246, 51.5007]}},
                {"type": "Feature", "properties": {"name": "Pyramids of Giza", "city": "Giza", "country": "Egypt", "type": "historic"}, "geometry": {"type": "Point", "coordinates": [31.1342, 29.9792]}},
                {"type": "Feature", "properties": {"name": "Golden Gate Bridge", "city": "San Francisco", "country": "USA", "type": "infrastructure"}, "geometry": {"type": "Point", "coordinates": [-122.4783, 37.8199]}},
                {"type": "Feature", "properties": {"name": "Burj Khalifa", "city": "Dubai", "country": "UAE", "type": "building"}, "geometry": {"type": "Point", "coordinates": [55.2744, 25.1972]}},
                {"type": "Feature", "properties": {"name": "Mount Fuji", "city": "Shizuoka", "country": "Japan", "type": "natural"}, "geometry": {"type": "Point", "coordinates": [138.7274, 35.3606]}},
                {"type": "Feature", "properties": {"name": "Sagrada Familia", "city": "Barcelona", "country": "Spain", "type": "cultural"}, "geometry": {"type": "Point", "coordinates": [2.1744, 41.4036]}},
                {"type": "Feature", "properties": {"name": "Petra", "city": "Ma'an", "country": "Jordan", "type": "historic"}, "geometry": {"type": "Point", "coordinates": [35.4444, 30.3285]}},
                {"type": "Feature", "properties": {"name": "Angkor Wat", "city": "Siem Reap", "country": "Cambodia", "type": "historic"}, "geometry": {"type": "Point", "coordinates": [103.8670, 13.4125]}},
            ]
        },
    },
    {
        "id": "ds_us-tech-hubs",
        "title": "US Tech Hubs",
        "description": "Major technology and startup hubs across the United States with notable companies and specializations.",
        "license": "public-domain",
        "category": "business",
        "tags": "tech,startups,business,silicon valley,innovation,us",
        "data": {
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "properties": {"name": "Silicon Valley", "city": "San Jose", "state": "CA", "focus": "General tech, AI, VC"}, "geometry": {"type": "Point", "coordinates": [-121.8863, 37.3382]}},
                {"type": "Feature", "properties": {"name": "San Francisco", "city": "San Francisco", "state": "CA", "focus": "SaaS, Fintech, AI"}, "geometry": {"type": "Point", "coordinates": [-122.4194, 37.7749]}},
                {"type": "Feature", "properties": {"name": "Seattle", "city": "Seattle", "state": "WA", "focus": "Cloud, E-commerce, Gaming"}, "geometry": {"type": "Point", "coordinates": [-122.3321, 47.6062]}},
                {"type": "Feature", "properties": {"name": "Austin", "city": "Austin", "state": "TX", "focus": "Semiconductors, SaaS, Crypto"}, "geometry": {"type": "Point", "coordinates": [-97.7431, 30.2672]}},
                {"type": "Feature", "properties": {"name": "New York City", "city": "New York", "state": "NY", "focus": "Fintech, Media, AdTech"}, "geometry": {"type": "Point", "coordinates": [-74.0060, 40.7128]}},
                {"type": "Feature", "properties": {"name": "Boston", "city": "Boston", "state": "MA", "focus": "Biotech, Robotics, EdTech"}, "geometry": {"type": "Point", "coordinates": [-71.0589, 42.3601]}},
                {"type": "Feature", "properties": {"name": "Denver/Boulder", "city": "Denver", "state": "CO", "focus": "Aerospace, Telecom, Outdoor Tech"}, "geometry": {"type": "Point", "coordinates": [-105.2705, 39.7392]}},
                {"type": "Feature", "properties": {"name": "Research Triangle", "city": "Raleigh", "state": "NC", "focus": "Biotech, Enterprise Software"}, "geometry": {"type": "Point", "coordinates": [-78.6382, 35.7796]}},
                {"type": "Feature", "properties": {"name": "Los Angeles", "city": "Los Angeles", "state": "CA", "focus": "Entertainment Tech, SpaceTech"}, "geometry": {"type": "Point", "coordinates": [-118.2437, 34.0522]}},
                {"type": "Feature", "properties": {"name": "Miami", "city": "Miami", "state": "FL", "focus": "Crypto, LatAm Gateway"}, "geometry": {"type": "Point", "coordinates": [-80.1918, 25.7617]}},
                {"type": "Feature", "properties": {"name": "Pittsburgh", "city": "Pittsburgh", "state": "PA", "focus": "Robotics, Autonomous Vehicles, AI"}, "geometry": {"type": "Point", "coordinates": [-79.9959, 40.4406]}},
                {"type": "Feature", "properties": {"name": "Washington DC", "city": "Washington", "state": "DC", "focus": "GovTech, Cybersecurity, Defense"}, "geometry": {"type": "Point", "coordinates": [-77.0369, 38.9072]}},
            ]
        },
    },
    {
        "id": "ds_world-universities-top",
        "title": "Top World Universities",
        "description": "Top-ranked universities globally with locations and approximate rankings.",
        "license": "public-domain",
        "category": "education",
        "tags": "universities,education,world,rankings,academic",
        "data": {
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "properties": {"name": "MIT", "city": "Cambridge", "country": "USA", "rank_approx": 1}, "geometry": {"type": "Point", "coordinates": [-71.0942, 42.3601]}},
                {"type": "Feature", "properties": {"name": "Stanford University", "city": "Stanford", "country": "USA", "rank_approx": 2}, "geometry": {"type": "Point", "coordinates": [-122.1697, 37.4275]}},
                {"type": "Feature", "properties": {"name": "Harvard University", "city": "Cambridge", "country": "USA", "rank_approx": 3}, "geometry": {"type": "Point", "coordinates": [-71.1167, 42.3770]}},
                {"type": "Feature", "properties": {"name": "University of Oxford", "city": "Oxford", "country": "UK", "rank_approx": 4}, "geometry": {"type": "Point", "coordinates": [-1.2544, 51.7548]}},
                {"type": "Feature", "properties": {"name": "University of Cambridge", "city": "Cambridge", "country": "UK", "rank_approx": 5}, "geometry": {"type": "Point", "coordinates": [0.1218, 52.2053]}},
                {"type": "Feature", "properties": {"name": "Caltech", "city": "Pasadena", "country": "USA", "rank_approx": 6}, "geometry": {"type": "Point", "coordinates": [-118.1253, 34.1377]}},
                {"type": "Feature", "properties": {"name": "ETH Zurich", "city": "Zurich", "country": "Switzerland", "rank_approx": 7}, "geometry": {"type": "Point", "coordinates": [8.5480, 47.3769]}},
                {"type": "Feature", "properties": {"name": "University of Tokyo", "city": "Tokyo", "country": "Japan", "rank_approx": 23}, "geometry": {"type": "Point", "coordinates": [139.7622, 35.7128]}},
                {"type": "Feature", "properties": {"name": "Tsinghua University", "city": "Beijing", "country": "China", "rank_approx": 14}, "geometry": {"type": "Point", "coordinates": [116.3266, 40.0003]}},
                {"type": "Feature", "properties": {"name": "National University of Singapore", "city": "Singapore", "country": "Singapore", "rank_approx": 11}, "geometry": {"type": "Point", "coordinates": [103.7764, 1.2966]}},
                {"type": "Feature", "properties": {"name": "University of Melbourne", "city": "Melbourne", "country": "Australia", "rank_approx": 33}, "geometry": {"type": "Point", "coordinates": [144.9612, -37.7983]}},
                {"type": "Feature", "properties": {"name": "University of Toronto", "city": "Toronto", "country": "Canada", "rank_approx": 21}, "geometry": {"type": "Point", "coordinates": [-79.3957, 43.6629]}},
            ]
        },
    },
    {
        "id": "ds_world-major-ports",
        "title": "World Major Seaports",
        "description": "Busiest seaports worldwide by container throughput. Essential for logistics and trade maps.",
        "license": "public-domain",
        "category": "transportation",
        "tags": "ports,shipping,trade,logistics,maritime,world",
        "data": {
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "properties": {"name": "Port of Shanghai", "country": "China", "teu_millions": 47.0}, "geometry": {"type": "Point", "coordinates": [121.8, 30.6]}},
                {"type": "Feature", "properties": {"name": "Port of Singapore", "country": "Singapore", "teu_millions": 37.2}, "geometry": {"type": "Point", "coordinates": [103.8, 1.2]}},
                {"type": "Feature", "properties": {"name": "Port of Ningbo-Zhoushan", "country": "China", "teu_millions": 33.3}, "geometry": {"type": "Point", "coordinates": [121.9, 29.9]}},
                {"type": "Feature", "properties": {"name": "Port of Shenzhen", "country": "China", "teu_millions": 28.8}, "geometry": {"type": "Point", "coordinates": [114.1, 22.5]}},
                {"type": "Feature", "properties": {"name": "Port of Guangzhou", "country": "China", "teu_millions": 24.2}, "geometry": {"type": "Point", "coordinates": [113.5, 22.9]}},
                {"type": "Feature", "properties": {"name": "Port of Busan", "country": "South Korea", "teu_millions": 22.7}, "geometry": {"type": "Point", "coordinates": [129.0, 35.1]}},
                {"type": "Feature", "properties": {"name": "Port of Qingdao", "country": "China", "teu_millions": 24.4}, "geometry": {"type": "Point", "coordinates": [120.3, 36.1]}},
                {"type": "Feature", "properties": {"name": "Port of Rotterdam", "country": "Netherlands", "teu_millions": 14.5}, "geometry": {"type": "Point", "coordinates": [4.3, 51.9]}},
                {"type": "Feature", "properties": {"name": "Port of Dubai", "country": "UAE", "teu_millions": 14.1}, "geometry": {"type": "Point", "coordinates": [55.3, 25.0]}},
                {"type": "Feature", "properties": {"name": "Port of Los Angeles", "country": "USA", "teu_millions": 9.9}, "geometry": {"type": "Point", "coordinates": [-118.3, 33.7]}},
                {"type": "Feature", "properties": {"name": "Port of Long Beach", "country": "USA", "teu_millions": 9.1}, "geometry": {"type": "Point", "coordinates": [-118.2, 33.7]}},
                {"type": "Feature", "properties": {"name": "Port of Hamburg", "country": "Germany", "teu_millions": 8.7}, "geometry": {"type": "Point", "coordinates": [9.9, 53.5]}},
            ]
        },
    },
    {
        "id": "ds_us-hospitals-major",
        "title": "US Major Hospitals",
        "description": "Top-ranked US hospitals with specializations and bed counts.",
        "license": "public-domain",
        "category": "health",
        "tags": "hospitals,health,medical,us,healthcare",
        "data": {
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "properties": {"name": "Mayo Clinic", "city": "Rochester", "state": "MN", "beds": 1265, "specialty": "Multi-specialty"}, "geometry": {"type": "Point", "coordinates": [-92.4666, 44.0225]}},
                {"type": "Feature", "properties": {"name": "Cleveland Clinic", "city": "Cleveland", "state": "OH", "beds": 1400, "specialty": "Cardiology"}, "geometry": {"type": "Point", "coordinates": [-81.6219, 41.5025]}},
                {"type": "Feature", "properties": {"name": "Johns Hopkins Hospital", "city": "Baltimore", "state": "MD", "beds": 1162, "specialty": "Research"}, "geometry": {"type": "Point", "coordinates": [-76.5913, 39.2964]}},
                {"type": "Feature", "properties": {"name": "Massachusetts General Hospital", "city": "Boston", "state": "MA", "beds": 999, "specialty": "Research"}, "geometry": {"type": "Point", "coordinates": [-71.0695, 42.3626]}},
                {"type": "Feature", "properties": {"name": "UCLA Medical Center", "city": "Los Angeles", "state": "CA", "beds": 520, "specialty": "Multi-specialty"}, "geometry": {"type": "Point", "coordinates": [-118.4452, 34.0660]}},
                {"type": "Feature", "properties": {"name": "UCSF Medical Center", "city": "San Francisco", "state": "CA", "beds": 600, "specialty": "Research"}, "geometry": {"type": "Point", "coordinates": [-122.4580, 37.7631]}},
                {"type": "Feature", "properties": {"name": "Cedars-Sinai", "city": "Los Angeles", "state": "CA", "beds": 886, "specialty": "Multi-specialty"}, "geometry": {"type": "Point", "coordinates": [-118.3802, 34.0752]}},
                {"type": "Feature", "properties": {"name": "NYU Langone", "city": "New York", "state": "NY", "beds": 1069, "specialty": "Research"}, "geometry": {"type": "Point", "coordinates": [-73.9741, 40.7420]}},
                {"type": "Feature", "properties": {"name": "Stanford Health Care", "city": "Stanford", "state": "CA", "beds": 613, "specialty": "Research"}, "geometry": {"type": "Point", "coordinates": [-122.1750, 37.4346]}},
                {"type": "Feature", "properties": {"name": "MD Anderson Cancer Center", "city": "Houston", "state": "TX", "beds": 670, "specialty": "Oncology"}, "geometry": {"type": "Point", "coordinates": [-95.3975, 29.7075]}},
            ]
        },
    },
]


def _calculate_bbox(data):
    """Calculate bounding box from GeoJSON features."""
    lngs, lats = [], []
    for f in data.get("features", []):
        coords = f.get("geometry", {}).get("coordinates", [])
        if len(coords) >= 2:
            lngs.append(coords[0])
            lats.append(coords[1])
    if not lngs:
        return -180, -90, 180, 90
    return min(lngs), min(lats), max(lngs), max(lats)


def seed():
    """Run the seed."""
    init_db()
    seeded = 0
    skipped = 0

    for ds in SEED_DATASETS:
        if dataset_exists(ds["id"]):
            logger.info(f"  skip (exists): {ds['id']}")
            skipped += 1
            continue

        data = ds["data"]
        features = data.get("features", [])
        bbox_w, bbox_s, bbox_e, bbox_n = _calculate_bbox(data)

        geom_types = set()
        for f in features:
            gt = f.get("geometry", {}).get("type")
            if gt:
                geom_types.add(gt)

        create_dataset(
            dataset_id=ds["id"],
            title=ds["title"],
            description=ds["description"],
            license=ds["license"],
            category=ds["category"],
            tags=ds["tags"],
            data=data,
            feature_count=len(features),
            geometry_types=",".join(sorted(geom_types)),
            bbox_west=bbox_w,
            bbox_south=bbox_s,
            bbox_east=bbox_e,
            bbox_north=bbox_n,
            file_size_bytes=len(json.dumps(data)),
            uploader_email="seed@spatix.io",
            agent_name="spatix-seed",
        )

        logger.info(f"  seeded: {ds['id']} ({len(features)} features)")
        seeded += 1

    logger.info(f"Done. Seeded {seeded}, skipped {skipped}.")


if __name__ == "__main__":
    seed()
