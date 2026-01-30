"use client";

import { useState } from "react";
import { XIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Todas las ubicaciones de USA extraídas de megapersonals.eu
const US_LOCATIONS = {
  "Alabama": ["Auburn", "Birmingham", "Dothan", "Gadsden", "Huntsville", "Mobile", "Montgomery", "Muscle Shoals", "Tuscaloosa"],
  "Alaska": ["Anchorage", "Fairbanks", "Juneau", "Kenai Peninsula"],
  "Arizona": ["Flagstaff", "Mohave County", "Phoenix", "Prescott", "Show Low", "Sierra Vista", "Tucson", "Yuma"],
  "Arkansas": ["Fayetteville", "Fort Smith", "Jonesboro", "Little Rock"],
  "California": ["Bakersfield", "Chico", "Concord", "Fresno", "Humboldt County", "Imperial County", "Inland Empire", "Lancaster", "Long Beach", "Los Angeles", "Mendocino", "Merced", "Modesto", "Monterey", "North Bay", "Oakland", "Orange County", "Palm Springs", "Redding", "Sacramento", "San Diego", "San Fernando Valley", "San Francisco", "San Gabriel Valley", "San Jose", "San Luis Obispo", "San Mateo", "Santa Barbara", "Santa Cruz", "Santa Maria", "Siskiyou", "Stockton", "Ventura", "Visalia"],
  "Colorado": ["Boulder", "Colorado Springs", "Denver", "Fort Collins", "Pueblo", "Rockies", "Western Slope"],
  "Connecticut": ["Bridgeport", "Eastern Connecticut", "Hartford", "New Haven", "Northwest"],
  "Delaware": ["Dover", "Milford", "Wilmington"],
  "District of Columbia": ["Annandale", "Northern Virginia", "Southern Maryland", "Washington"],
  "Florida": ["Daytona", "Fort Lauderdale", "Fort Myers", "Gainesville", "Jacksonville", "Keys", "Miami", "Ocala", "Okaloosa", "Orlando", "Palm Bay", "Panama City", "Pensacola", "Sarasota", "Space Coast", "St. Augustine", "Tallahassee", "Tampa", "Treasure Coast", "West Palm Beach"],
  "Georgia": ["Albany", "Athens", "Atlanta", "Augusta", "Brunswick", "Columbus", "Macon", "Northwest Georgia", "Savannah", "Statesboro", "Valdosta"],
  "Hawaii": ["Big Island", "Honolulu", "Kauai", "Maui"],
  "Idaho": ["Boise", "East Idaho", "Lewiston", "Twin Falls"],
  "Illinois": ["Bloomington", "Carbondale", "Chambana", "Chicago", "Decatur", "La Salle County", "Mattoon", "Peoria", "Rockford", "Springfield", "Western Illinois"],
  "Indiana": ["Bloomington", "Evansville", "Ft Wayne", "Indianapolis", "Kokomo", "Lafayette", "Muncie", "Richmond", "South Bend", "Terre Haute"],
  "Iowa": ["Ames", "Cedar Rapids", "Desmoines", "Dubuque", "Fort Dodge", "Iowa City", "Mason City", "Quad Cities", "Sioux City", "Southeast Iowa", "Waterloo"],
  "Kansas": ["Lawrence", "Manhattan", "Salina", "Topeka", "Wichita"],
  "Kentucky": ["Bowling Green", "Eastern Kentucky", "Lexington", "Louisville", "Owensboro", "Western Kentucky"],
  "Louisiana": ["Alexandria", "Baton Rouge", "Houma", "Lafayette", "Lake Charles", "Monroe", "New Orleans", "Shreveport"],
  "Maine": ["Bangor", "Lewiston-Auburn", "Portland"],
  "Maryland": ["Annapolis", "Baltimore", "Cumberland Valley", "Eastern Shore", "Frederick", "Western Maryland"],
  "Massachusetts": ["Boston", "Brockton", "Cape Cod", "Lowell", "South Coast", "Springfield", "Worcester"],
  "Michigan": ["Ann Arbor", "Battle Creek", "Central Michigan", "Detroit", "Flint", "Grand Rapids", "Holland", "Jackson", "Kalamazoo", "Lansing", "Monroe", "Muskegon", "Northern Michigan", "Port Huron", "Saginaw", "Southwest Michigan", "Upper Peninsula"],
  "Minnesota": ["Bemidji", "Brainerd", "Duluth", "Mankato", "Minneapolis", "Rochester", "St. Cloud"],
  "Mississippi": ["Biloxi", "Hattiesburg", "Jackson", "Meridian", "North Mississippi", "Southwest Mississippi"],
  "Missouri": ["Columbia", "Joplin", "Kansas City", "Kirksville", "Lake Of The Ozarks", "Saint Louis", "Southeast Missouri", "Springfield", "St Joseph"],
  "Montana": ["Billings", "Bozeman", "Butte", "Great Falls", "Helena", "Kalispell", "Missoula"],
  "Nebraska": ["Grand Island", "Lincoln", "North Platte", "Omaha", "Scottsbluff"],
  "Nevada": ["Elko", "Las Vegas", "Reno", "Virginia City"],
  "New Hampshire": ["Concord", "Dover", "Manchester", "Nashua"],
  "New Jersey": ["Central Jersey", "Jersey Shore", "North Jersey", "South Jersey"],
  "New Mexico": ["Albuquerque", "Clovis", "Farmington", "Las Cruces", "Roswell", "Santa Fe"],
  "New York": ["Albany", "Binghamton", "Bronx", "Brooklyn", "Buffalo", "Catskills", "Chautauqua", "Elmira", "Finger Lakes", "Glens Falls", "Hudson Valley", "Ithaca", "Long Island", "Manhattan", "New York", "Oneonta", "Plattsburgh", "Potsdam", "Queens", "Rochester", "Staten Island", "Syracuse", "Twin Tiers", "Utica", "Watertown", "Westchester"],
  "North Carolina": ["Asheville", "Boone", "Charlotte", "Eastern", "Fayetteville", "Greensboro", "Hickory", "High Point", "Outer Banks", "Raleigh", "Raleigh-Durham", "Wilmington", "Winston-Salem"],
  "North Dakota": ["Bismarck", "Fargo", "Grand Forks", "Minot"],
  "Ohio": ["Akron", "Ashtabula", "Athens", "Cambridge", "Chillicothe", "Cincinnati", "Cleveland", "Columbus", "Dayton", "Findlay", "Mansfield", "Sandusky", "Toledo", "Tuscarawas County", "Youngstown"],
  "Oklahoma": ["Lawton", "Norman", "Oklahoma City", "Stillwater", "Tulsa"],
  "Oregon": ["Bend", "Corvallis", "East Oregon", "Eugene", "Klamath Falls", "Medford", "Oregon Coast", "Portland", "Roseburg", "Salem"],
  "Pennsylvania": ["Allentown", "Altoona", "Chambersburg", "Erie", "Harrisburg", "Lancaster", "Meadville", "Penn State", "Philadelphia", "Pittsburgh", "Poconos", "Reading", "Scranton", "Williamsport", "York"],
  "Rhode Island": ["Providence", "Warwick"],
  "South Carolina": ["Charleston", "Columbia", "Florence", "Greenville", "Hilton Head", "Myrtle Beach"],
  "South Dakota": ["Aberdeen", "Pierre", "Rapid City", "Sioux Falls"],
  "Tennessee": ["Chattanooga", "Clarksville", "Cookeville", "Johnson City", "Knoxville", "Memphis", "Nashville", "Tri-Cities"],
  "Texas": ["Abilene", "Amarillo", "Austin", "Beaumont", "Brownsville", "College Station", "Corpus Christi", "Dallas", "Del Rio", "Denton", "El Paso", "Fort Worth", "Galveston", "Houston", "Huntsville", "Killeen", "Laredo", "Longview", "Lubbock", "Mcallen", "Mid Cities", "Odessa", "San Antonio", "San Marcos", "Texarkana", "Texoma", "Tyler", "Victoria", "Waco", "Wichita Falls"],
  "Utah": ["Logan", "Ogden", "Provo", "Salt Lake City", "St. George"],
  "Vermont": ["Burlington", "Colchester", "Essex"],
  "Virginia": ["Charlottesville", "Chesapeake", "Danville", "Fredericksburg", "Hampton", "Harrisonburg", "Lynchburg", "New River Valley", "Newport News", "Norfolk", "Portsmouth", "Richmond", "Roanoke", "Southwest Virginia", "Suffolk", "Virginia Beach"],
  "Washington": ["Bellingham", "Everett", "Moses Lake", "Mt. Vernon", "Olympia", "Pullman", "Seattle", "Spokane", "Tacoma", "Tri-Cities", "Wenatchee", "Yakima"],
  "West Virginia": ["Charleston", "Huntington", "Martinsburg", "Morgantown", "Parkersburg", "Southern West Virginia", "Wheeling"],
  "Wisconsin": ["Appleton", "Eau Claire", "Green Bay", "Janesville", "La Crosse", "Madison", "Milwaukee", "Racine", "Sheboygan", "Wausau"],
  "Wyoming": ["Casper", "Cheyenne", "Laramie"]
};

interface CitySelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCity: (city: string) => void;
  currentCity?: string;
}

export function CitySelector({ 
  isOpen, 
  onClose, 
  onSelectCity,
  currentCity 
}: CitySelectorProps) {
  const [view, setView] = useState<'countries' | 'states' | 'cities'>('countries');
  const [selectedState, setSelectedState] = useState<string>('');

  if (!isOpen) return null;

  const handleStateClick = (state: string) => {
    setSelectedState(state);
    setView('cities');
  };

  const handleCityClick = (city: string) => {
    // Enviar ciudad con formato "Ciudad, Estado" para que la extensión pueda navegar el modal
    const cityWithState = selectedState ? `${city}, ${selectedState}` : city;
    onSelectCity(cityWithState);
    onClose();
    // Reset view
    setView('countries');
    setSelectedState('');
  };

  const handleBack = () => {
    if (view === 'cities') {
      setView('states');
      setSelectedState('');
    } else if (view === 'states') {
      setView('countries');
    }
  };

  const handleCloseModal = () => {
    onClose();
    // Reset view después de cerrar
    setTimeout(() => {
      setView('countries');
      setSelectedState('');
    }, 300);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-h-[90vh] overflow-hidden border-2 border-cyan-500/30">
        {/* Header */}
        <div className="bg-gradient-to-r from-cyan-500 to-blue-600 p-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-white">
            Choose a Location
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCloseModal}
            className="rounded-full bg-black/30 hover:bg-black/50 text-white h-8 w-8"
          >
            <XIcon className="h-5 w-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-80px)] bg-gray-50 dark:bg-gray-800">
          {view === 'countries' && (
            /* Solo United States */
            <div className="p-3">
              <button
                onClick={() => setView('states')}
                className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold py-4 px-6 rounded-xl text-lg transition-all shadow-lg hover:shadow-xl hover:scale-[1.02]"
              >
                United States
              </button>
            </div>
          )}

          {view === 'states' && (
            /* Lista de Estados */
            <div className="p-2 space-y-2">
              <button
                onClick={handleBack}
                className="w-full text-left py-2 px-4 rounded-lg font-semibold bg-gray-600 dark:bg-gray-700 text-white hover:bg-gray-700 dark:hover:bg-gray-600 transition-all text-sm shadow-md"
              >
                ← Volver
              </button>
              
              {Object.keys(US_LOCATIONS).map((state) => (
                <button
                  key={state}
                  onClick={() => handleStateClick(state)}
                  className="w-full text-left py-3 px-4 rounded-lg font-semibold transition-all shadow-sm hover:shadow-md flex items-center justify-between group bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-600 hover:to-blue-700"
                >
                  <span>{state}</span>
                  <span className="text-2xl opacity-60 group-hover:opacity-100 transition-opacity">
                    +
                  </span>
                </button>
              ))}
            </div>
          )}

          {view === 'cities' && selectedState && (
            /* Lista de Ciudades del estado seleccionado */
            <div className="p-2 space-y-2">
              <button
                onClick={handleBack}
                className="w-full text-left py-2 px-4 rounded-lg font-semibold bg-gray-600 dark:bg-gray-700 text-white hover:bg-gray-700 dark:hover:bg-gray-600 transition-all text-sm shadow-md"
              >
                ← Volver a Estados
              </button>

              <div className="text-center py-2 text-sm text-gray-500 dark:text-gray-400 font-semibold">
                {selectedState}
              </div>
              
              {US_LOCATIONS[selectedState as keyof typeof US_LOCATIONS]?.map((city) => (
                <button
                  key={city}
                  onClick={() => handleCityClick(city)}
                  className={cn(
                    "w-full text-left py-3 px-4 rounded-lg font-semibold transition-all shadow-sm hover:shadow-md flex items-center justify-between group",
                    currentCity === city 
                      ? "bg-gradient-to-r from-pink-500 to-pink-600 text-white" 
                      : "bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700"
                  )}
                >
                  <span>{city}</span>
                  <span className="text-2xl opacity-60 group-hover:opacity-100 transition-opacity">
                    ✓
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
