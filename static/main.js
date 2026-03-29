// Auth State
let authMode = 'login'; // login or register

function switchAuthTab(mode) {
    authMode = mode;
    document.getElementById('tab-login').classList.toggle('active', mode === 'login');
    document.getElementById('tab-register').classList.toggle('active', mode === 'register');
    document.getElementById('auth-submit-btn').textContent = mode === 'login' ? 'Log In' : 'Create Account';

    const isRegister = mode === 'register';
    document.getElementById('name-group').classList.toggle('hidden', !isRegister);
    document.getElementById('confirm-pwd-group').classList.toggle('hidden', !isRegister);

    // Toggle required attributes
    document.getElementById('full_name').required = isRegister;
    document.getElementById('confirm_password').required = isRegister;

    document.getElementById('auth-error').classList.add('hidden');
    document.getElementById('auth-success').classList.add('hidden');
}

async function handleAuth(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const full_name = document.getElementById('full_name').value;
    const confirm_password = document.getElementById('confirm_password').value;

    const btn = document.getElementById('auth-submit-btn');
    const errObj = document.getElementById('auth-error');
    const succObj = document.getElementById('auth-success');

    errObj.classList.add('hidden');
    succObj.classList.add('hidden');

    if (authMode === 'register' && password !== confirm_password) {
        errObj.textContent = "Passwords do not match";
        errObj.classList.remove('hidden');
        return;
    }

    btn.disabled = true;

    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';

    const payload = authMode === 'login'
        ? { email, password }
        : { full_name, email, password, confirm_password };

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.message || 'Authentication failed');
        }

        if (authMode === 'login') {
            const params = new URLSearchParams(window.location.search);
            const route = params.get('route');
            window.location.href = route ? `/dashboard?route=${route}` : '/dashboard';
        } else {
            succObj.textContent = "Registration successful! You can now Log In.";
            succObj.classList.remove('hidden');
            switchAuthTab('login');
        }

    } catch (err) {
        errObj.textContent = err.message;
        errObj.classList.remove('hidden');
    } finally {
        btn.disabled = false;
    }
}

// Planning & Dashboard Navigation
function showSection(sectionId) {
    // Handle alias for home-space
    if (sectionId === 'welcome-section') sectionId = 'home-space';

    const sections = ['home-space', 'planner-section', 'experience-section', 'experience-results-section', 'my-trips-section', 'results-section', 'loading-state', 'blog-section', 'calendar-section', 'profile-section'];
    
    const targetSpace = document.getElementById(sectionId);
    if (!targetSpace) return;

    const currentActive = document.querySelector('.action-space.active-space');
    if (targetSpace === currentActive) return;

    // ANTIGRAVITY NAVIGATION: 3D Transition States
    if (currentActive) {
        if (sectionId === 'home-space') {
            // "Backward" Navigation: current action floats into foreground and vanishes
            currentActive.className = 'action-space foreground-space';
        } else {
            // "Forward" Navigation: current dashboard recedes into distance
            currentActive.className = 'action-space background-space';
        }
    }

    // Clear all other inactive spaces
    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el && id !== sectionId && el !== currentActive) {
            el.className = 'action-space inactive-space';
        }
    });

    // Activate the new space
    targetSpace.className = 'action-space active-space';

    // Update Sidebar Active State
    document.querySelectorAll('.sidebar-link').forEach(link => link.classList.remove('active'));
    if (sectionId === 'home-space') document.getElementById('nav-home')?.classList.add('active');
    if (sectionId === 'profile-section') document.getElementById('nav-profile')?.classList.add('active');
    if (sectionId === 'my-trips-section') document.getElementById('nav-trips')?.classList.add('active');
    if (sectionId === 'calendar-section') document.getElementById('nav-calendar')?.classList.add('active');
    if (sectionId === 'blog-section') document.getElementById('nav-blog')?.classList.add('active');
    if (sectionId === 'settings-section') document.getElementById('nav-settings')?.classList.add('active');

    if (sectionId === 'planner-section') {
        resetGenerateBtn();
    }

    if (sectionId === 'my-trips-section') {
        loadMyTrips();
    }
    
    if (sectionId === 'blog-section') {
        fetchBlogs();
    }

    if (sectionId === 'calendar-section') {
        initCalendar();
    }

    if (sectionId === 'profile-section') {
        fetchUserProfile();
    }
}

async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
}

let placeCount = 0;

function addNextPlace() {
    placeCount++;
    const container = document.getElementById('places-container');

    const placeHTML = `
        <div class="glass-card mockup-card place-card" id="place-node-${placeCount}" style="max-width: 100%; margin-bottom: 1.5rem; transform: none; box-shadow: none; border-left: 4px solid var(--brand-primary);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <h4>Place ${placeCount}</h4>
                ${placeCount > 1 ? `<button type="button" class="btn btn-secondary" style="padding: 0.2rem 0.6rem; font-size: 0.8rem;" onclick="removePlace(${placeCount})">Remove</button>` : ''}
            </div>
            
            <div class="form-row mt-2">
                <div class="input-group">
                    <label>Place Name</label>
                    <input type="text" class="p-name" required placeholder="e.g. Tea Museum">
                </div>
                <div class="input-group">
                    <label>Place Rating (1-5)</label>
                    <input type="number" class="p-rating" required min="1" max="5" step="0.1" placeholder="4.5">
                </div>
                <div class="input-group">
                    <label>Entry Fee / Expense (₹)</label>
                    <input type="number" class="p-fee" required min="0" placeholder="200" value="0" oninput="calculateTotalExpense()">
                </div>
            </div>
            
            <div class="form-row mt-2">
                <div class="input-group" style="flex-basis: 100%;">
                    <label>Experience Review (Optional)</label>
                    <textarea class="p-review" placeholder="Tell the community about your visit... was it worth the fee?" style="width : 100%; min-height: 60px; padding: 0.75rem; background: rgba(255,255,255,0.05); border: 1px solid var(--border-subtle); border-radius: 8px; color: var(--text-primary);"></textarea>
                </div>
            </div>

            ${placeCount > 1 ? `
            <div class="form-row" style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-subtle);">
                <div class="input-group">
                    <label>Travel Method from Previous</label>
                    <select class="p-transport">
                        <option value="bus">Bus</option>
                        <option value="car">Car/Taxi</option>
                        <option value="train">Train</option>
                        <option value="walking">Walking</option>
                        <option value="bike">Bike</option>
                    </select>
                </div>
                <div class="input-group">
                    <label>Distance (km)</label>
                    <input type="number" class="p-distance" min="0" step="0.1" placeholder="15">
                </div>
                <div class="input-group">
                    <label>Travel Cost (₹)</label>
                    <input type="number" class="p-tcost" min="0" placeholder="100" value="0" oninput="calculateTotalExpense()">
                </div>
                <div class="input-group">
                    <label>Travel Rating</label>
                    <input type="number" class="p-trating" min="1" max="5" step="0.1" placeholder="4">
                </div>
            </div>
            ` : ''}
        </div>
    `;

    container.insertAdjacentHTML('beforeend', placeHTML);
}

function removePlace(id) {
    const el = document.getElementById(`place-node-${id}`);
    if (el) {
        el.remove();
        calculateTotalExpense();
    }
}

function calculateTotalExpense() {
    let total = 0;

    // 1. Stay Price
    const stayPrice = parseFloat(document.getElementById('exp_stay_price').value) || 0;
    total += stayPrice;

    // 2. Places Entry Fees
    document.querySelectorAll('.p-fee').forEach(input => {
        total += parseFloat(input.value) || 0;
    });

    // 3. Travel Costs
    document.querySelectorAll('.p-tcost').forEach(input => {
        total += parseFloat(input.value) || 0;
    });

    document.getElementById('calc-expense-display').innerText = `₹${total}`;
    return total;
}

async function handleExperienceSubmit(e) {
    e.preventDefault();

    const btn = document.getElementById('exp-submit-btn');
    const oldText = btn.querySelector('.btn-text').innerText;
    const loader = document.getElementById('exp-loader');

    btn.disabled = true;
    btn.querySelector('.btn-text').classList.add('hidden');
    loader.classList.remove('hidden');

    // Build JSON Payload
    const payload = {
        destination: document.getElementById('exp_dest').value,
        trip_date: document.getElementById('exp_date').value,
        companion_type: document.getElementById('exp_companion').value,
        stay_name: document.getElementById('exp_stay_name').value,
        stay_price: parseFloat(document.getElementById('exp_stay_price').value) || 0,
        stay_rating: parseFloat(document.getElementById('exp_stay_rating').value) || null,
        total_expense: calculateTotalExpense(),
        has_children: document.getElementById('exp_has_children').checked,
        has_guides: document.getElementById('exp_has_guides').checked,
        guide_name: document.getElementById('exp_guide_name').value,
        guide_phone: document.getElementById('exp_guide_phone').value,
        guide_specialty: document.getElementById('exp_guide_specialty').value,
        emergency_ambulance: document.getElementById('exp_emergency_ambulance').value,
        emergency_police: document.getElementById('exp_emergency_police').value,
        emergency_health: document.getElementById('exp_emergency_health').value,
        accessibility_notes: document.getElementById('exp_accessibility_notes').value || "",
        places: []
    };

    document.querySelectorAll('.place-card').forEach(card => {
        const pObj = {
            place_name: card.querySelector('.p-name').value,
            place_rating: parseFloat(card.querySelector('.p-rating').value) || null,
            entry_fee: parseFloat(card.querySelector('.p-fee').value) || 0,
            travel_method: card.querySelector('.p-transport') ? card.querySelector('.p-transport').value : null,
            distance_from_prev: card.querySelector('.p-distance') ? parseFloat(card.querySelector('.p-distance').value) : null,
            travel_cost: card.querySelector('.p-tcost') ? parseFloat(card.querySelector('.p-tcost').value) : 0,
            travel_rating: card.querySelector('.p-trating') ? parseFloat(card.querySelector('.p-trating').value) : null,
            experience_review: card.querySelector('.p-review').value || ""
        };
        payload.places.push(pObj);
    });

    try {
        const res = await fetch('/api/experiences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.status === 401) {
            window.location.href = '/login';
            return;
        }

        if (!res.ok) throw new Error("Failed to save experience");

        // Parse Payload to view the generated map immediately 
        renderExperienceItinerary(payload);

        e.target.reset();
        document.getElementById('places-container').innerHTML = '';
        placeCount = 0;
        addNextPlace(); // Re-add the first empty node
        calculateTotalExpense();

    } catch (err) {
        alert("Error saving experience. Check Console.");
        console.error(err);
    } finally {
        btn.disabled = false;
        btn.querySelector('.btn-text').classList.remove('hidden');
        loader.classList.add('hidden');
    }
}

async function loadMyTrips() {
    const container = document.getElementById('past-trips-list');
    if (!container) return;

    container.innerHTML = '<div class="loading-state"><div class="loader-spinner" style="margin: 0 auto;"></div><p>Loading your journeys...</p></div>';

    try {
        const res = await fetch('/api/my-trips');
        if (res.status === 401) {
            window.location.href = '/login';
            return;
        }

        const trips = await res.json();
        container.innerHTML = '';

        if (trips.length === 0) {
            container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; margin-top: 2rem;">No past trips found. Start by registering your first experience!</p>';
            return;
        }

        trips.forEach(trip => {
            const tripCard = document.createElement('div');
            tripCard.className = 'glass-card mockup-card mt-2';
            tripCard.style.cssText = 'padding: 1.5rem; transform: none; box-shadow: none; margin-bottom: 1.5rem;';

            const placesText = trip.places.map(p => p.place_name).join(' → ');

            tripCard.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                    <div>
                        <h3 style="margin-bottom: 0.25rem;">${trip.destination}</h3>
                        <p style="font-size: 0.85rem; color: var(--text-secondary);">${trip.trip_date || 'No date set'} • ${trip.companion_type || 'Solo'}</p>
                    </div>
                    <div class="budget-badge" style="padding: 0.25rem 0.75rem;">
                        <span class="value" style="font-size: 1rem;">₹${trip.total_expense}</span>
                    </div>
                </div>
                <div style="padding: 1rem; background: rgba(255,255,255,0.03); border-radius: 8px;">
                    <p style="font-size: 0.9rem; color: var(--text-primary); line-height: 1.4;">${placesText}</p>
                </div>
                <div style="margin-top: 1rem; display: flex; gap: 1rem; font-size: 0.8rem; color: var(--text-secondary);">
                    <span>${trip.places.length} Places Visited</span>
                    <span>Stay: ${trip.stay_name || 'N/A'}</span>
                </div>
                ${(trip.emergency_police || trip.emergency_ambulance || trip.emergency_health) ? `
                    <div style="margin-top: 0.5rem; padding: 0.5rem; background: rgba(255,100,100,0.05); border-radius: 6px; font-size: 0.75rem; border: 1px solid rgba(255,100,100,0.1);">
                        <span style="color: var(--accent-red); font-weight: 700; margin-right: 0.5rem;">🚨 Local Emergency:</span>
                        <span style="color: var(--text-primary);">P: ${trip.emergency_police || '-'} | A: ${trip.emergency_ambulance || '-'} | H: ${trip.emergency_health || '-'}</span>
                    </div>
                ` : ''}
                ${trip.accessibility_notes ? `
                    <div style="margin-top: 0.5rem; padding: 0.5rem; background: rgba(100,255,100,0.05); border-radius: 6px; font-size: 0.75rem; border: 1px solid rgba(100,255,100,0.1);">
                        <span style="color: var(--brand-primary); font-weight: 700; margin-right: 0.5rem;">♿ Accessibility Review:</span>
                        <span style="color: var(--text-primary);">${trip.accessibility_notes}</span>
                    </div>
                ` : ''}
            `;
            container.appendChild(tripCard);
        });

    } catch (err) {
        container.innerHTML = '<p style="color: var(--accent-red); text-align: center;">Failed to load your trips. Please try again.</p>';
        console.error(err);
    }
}

function renderExperienceItinerary(data) {
    showSection('experience-results-section');

    document.getElementById('exp-result-dest').innerText = `Destination: ${data.destination || 'Unknown'}`;
    document.getElementById('exp-result-cost').innerText = `₹${data.total_expense || 0}`;

    const timeline = document.getElementById('experience-timeline');
    timeline.innerHTML = '';

    let simulatedTime = new Date();
    simulatedTime.setHours(9, 0, 0, 0); // Start at 09:00 AM

    data.places.forEach((place, index) => {

        // 1. If it's not the first place, render the travel block connecting them
        if (index > 0 && place.travel_method) {
            const travelHTML = `
                <div class="route-line" style="height: auto; min-height: 40px; margin-top: 10px; margin-bottom: 10px;"></div>
                <div class="route-item" style="margin-left: 20px; margin-bottom: 20px;">
                    <div class="details" style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; font-size: 0.9rem;">
                        <span style="color: var(--brand-primary); font-weight: 500;">Travel: ${place.travel_method.charAt(0).toUpperCase() + place.travel_method.slice(1)}</span>
                        ${place.distance_from_prev ? `<span>Distance: ${place.distance_from_prev} km</span>` : ''}
                        <span>Cost: ₹${place.travel_cost || 0}</span>
                    </div>
                </div>
            `;
            timeline.innerHTML += travelHTML;

            // Add roughly 2 hours for travel & sightseeing overhead to the clock for visual simulation
            simulatedTime.setHours(simulatedTime.getHours() + 2);
        }

        const timeString = simulatedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const isLastNode = (index === data.places.length - 1);

        // 2. Render the actual Place node
        const placeHTML = `
            <div class="route-item" style="margin-top: 10px;">
                <div class="node"></div>
                <div class="details">
                    <span class="time">${timeString}</span>
                    <span class="place">${place.place_name}</span>
                    <span class="rating" style="color: var(--accent-yellow);">Rating: ${place.place_rating || 'N/A'}/5</span>
                    <span class="rating">Entry Fee: ₹${place.entry_fee || 0}</span>
                    ${place.experience_review ? `<p style="font-size: 0.8rem; font-style: italic; color: var(--text-secondary); margin-top: 0.5rem;">" ${place.experience_review} "</p>` : ''}
                </div>
            </div>
            ${!isLastNode ? '<div class="route-line"></div>' : ''}
        `;

        timeline.innerHTML += placeHTML;
    });
}

async function generateItinerary(e) {
    e.preventDefault();

    const dest = document.getElementById('destination').value;
    const budget = document.getElementById('budget').value;
    const duration = document.getElementById('duration').value;
    const transport = document.getElementById('transport').value;
    const style = document.getElementById('style').value;
    const guides = document.getElementById('need_guides').checked;
    const children = document.getElementById('has_children').checked;

    const submitBtn = document.getElementById('generate-btn');
    const btnText = submitBtn.querySelector('.btn-text');
    const loader = document.getElementById('generate-loader');

    // UI State Start
    submitBtn.disabled = true;
    btnText.classList.add('hidden');
    loader.classList.remove('hidden');

    showSection('loading-state');

    // Fake progress loading for UX purposes
    const loadingState = document.getElementById('loading-state');
    const listItems = loadingState.querySelectorAll('.loading-steps li');
    let delayCounter = 0;

    for (let i = 0; i < listItems.length; i++) {
        setTimeout(() => {
            listItems.forEach(el => el.classList.remove('active'));
            listItems[i].classList.add('active');
        }, delayCounter);
        delayCounter += 1000;
    }

    // API Call
    try {
        const res = await fetch('/api/generate-itinerary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                destination: dest,
                budget: Number(budget),
                duration: Number(duration),
                transport,
                style,
                guides,
                children,
                disability_info: document.getElementById('has_disabilities').checked ? document.getElementById('disability_info').value : "",
                guide_preferences: document.getElementById('need_guides').checked ? document.getElementById('guide_preferences').value : ""
            })
        });

        if (res.status === 401) {
            window.location.href = '/login';
            return;
        }

        const data = await res.json();

        if (!res.ok) {
            alert(data.message || "Failed to generate itinerary. Try increasing your budget or checking your API keys.");
            resetGenerateBtn();
            showSection('planner-section');
            return;
        }

        // Let the UX loader finish its sequence before rendering
        setTimeout(() => {
            renderItinerary(data);
            // Render the Map
            if (data.days && data.days.length > 0) {
                renderMap(data);
            }
        }, delayCounter + 500);

    } catch (err) {
        alert("Failed to generate itinerary. Technical error: " + err.message);
        console.error(err);
        resetGenerateBtn();
        showSection('planner-section');
    }
}

// Global maps object mapping day numbers to Leaflet instances
let itineraryMaps = {};

async function renderMap(itineraryData) {
    const { destination, days, stay } = itineraryData;

    // Helper function for artificial delay
    const delay = ms => new Promise(res => setTimeout(res, ms));
    let isFirstReq = true;

    for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
        const day = days[dayIndex];
        const mapContainerId = `map-day-${day.day_number}`;
        const mapContainer = document.getElementById(mapContainerId);
        
        if (!mapContainer) continue;
        
        mapContainer.style.display = 'block';

        // Clean up pre-existing map instance for this day if re-generating
        if (itineraryMaps[day.day_number]) {
            itineraryMaps[day.day_number].off();
            itineraryMaps[day.day_number].remove();
        }

        itineraryMaps[day.day_number] = L.map(mapContainerId).setView([10.0, 76.0], 8);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(itineraryMaps[day.day_number]);

        const currentMap = itineraryMaps[day.day_number];

        const placesToGeocode = [];

        // Add Stay as the first origin point if it exists for Day 1
        if (day.day_number === 1 && stay && stay.name) {
            placesToGeocode.push({
                place: stay.name,
                time: 'Check-in',
                transport: 'stay'
            });
        }

        // Extract all places for this single day
        day.route.forEach(item => {
            if (item.place && item.place !== "Unknown") {
                placesToGeocode.push(item);
            }
        });

        if (placesToGeocode.length === 0) {
            mapContainer.style.display = 'none';
            continue;
        }

        mapContainer.style.opacity = '0.7';
        const coordinates = [];
        const markers = [];

        for (let i = 0; i < placesToGeocode.length; i++) {
            const item = placesToGeocode[i];
            try {
                // Respect Nominatim's 1 request/second policy across ALL geocodings
                if (!isFirstReq) await delay(1100);
                isFirstReq = false;
                
                const query = `${item.place}, ${destination}`;
                const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`, {
                    headers: {
                        'User-Agent': 'TravelItineraryApp/1.0 (LocalTest)'
                    }
                });
                const data = await response.json();

                if (data && data.length > 0) {
                    const lat = parseFloat(data[0].lat);
                    const lon = parseFloat(data[0].lon);
                    coordinates.push([lat, lon]);

                    const marker = L.marker([lat, lon]).addTo(currentMap);
                    const emoji = item.transport ? getTransportEmoji(item.transport) : '📍';
                    marker.bindPopup(`<b>${item.place}</b><br>Arrive: ${item.time} ${emoji}`);
                    markers.push(marker);
                } else {
                    console.warn(`Could not geocode location: ${query}`);
                }
            } catch (err) {
                console.error(`Geocoding failed for ${item.place}:`, err);
            }
        }

        mapContainer.style.opacity = '1.0';

        if (coordinates.length > 0) {
            const polyline = L.polyline(coordinates, {
                color: '#7B2CBF',
                weight: 3,
                opacity: 0.8,
                dashArray: '10, 10'
            }).addTo(currentMap);

            currentMap.fitBounds(polyline.getBounds(), { padding: [30, 30] });
            
            if (markers.length > 0) {
                markers[0].openPopup();
            }
        } else {
            // Hide map div completely if geocoding completely fails for this day
            mapContainer.style.display = 'none';
        }
    }
}

function renderItinerary(data) {
    showSection('results-section');
    resetGenerateBtn();

    document.getElementById('result-cost').textContent = `₹${data.total_cost || 0} `;

    const timeline = document.getElementById('itinerary-timeline');
    timeline.innerHTML = '';

    if ((data.guide_contacts && data.guide_contacts.length > 0) || data.national_helplines) {
        const infoRow = document.createElement('div');
        infoRow.style = "display: flex; gap: 1.5rem; flex-wrap: wrap; margin-bottom: 2rem; width: 100%;";
        
        // --- Guide Card ---
        if (data.guide_contacts && data.guide_contacts.length > 0) {
            const guideCard = document.createElement('div');
            guideCard.className = "action-card glass-card premium-card";
            guideCard.style = "flex: 1; min-width: 320px; padding: 2rem; cursor: default;";
            guideCard.innerHTML = `
                <div style="display: flex; align-items: center; gap: 1.25rem; margin-bottom: 1.5rem;">
                    <div class="card-icon" style="width: 60px; height: 60px; font-size: 1.8rem; background: rgba(76, 175, 80, 0.1); color: var(--brand-primary);"><i class="fa-solid fa-phone-volume"></i></div>
                    <div>
                        <h3 style="margin:0; font-size: 1.25rem;">Verified Guides</h3>
                        <p style="margin:0; font-size: 0.85rem; color: var(--text-secondary);">Direct contact to local experts</p>
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr; gap: 0.75rem;">
                    ${data.guide_contacts.map(g => `
                        <div style="background: rgba(255,255,255,0.03); padding: 0.8rem 1rem; border-radius: 12px; border: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <div style="font-weight: 700; color: var(--text-primary); font-size: 0.95rem;">${g.name}</div>
                                <div style="font-size: 0.75rem; color: var(--text-secondary);">${g.specialty || 'General Guide'}</div>
                            </div>
                            <div style="color: var(--brand-primary); font-weight: 800; font-family: monospace;">${g.phone}</div>
                        </div>
                    `).join('')}
                </div>
            `;
            infoRow.appendChild(guideCard);
        }

        // --- Emergency Card ---
        if (data.national_helplines) {
            const emergencyCard = document.createElement('div');
            emergencyCard.className = "action-card glass-card danger-card";
            emergencyCard.style = "flex: 1; min-width: 320px; padding: 2rem; cursor: pointer; transition: all 0.3s ease;";
            emergencyCard.onclick = () => toggleEmergencyList();
            emergencyCard.innerHTML = `
                <div style="display: flex; align-items: center; gap: 1.25rem; height: 100%; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 1.25rem;">
                        <div class="card-icon" style="width: 60px; height: 60px; font-size: 1.8rem; background: rgba(239, 68, 68, 0.1); color: var(--accent-red);"><i class="fa-solid fa-triangle-exclamation"></i></div>
                        <div>
                            <h3 style="margin:0; font-size: 1.25rem;">Emergency Numbers</h3>
                            <p style="margin:0; font-size: 0.85rem; color: var(--text-secondary);">Tap to view national helplines</p>
                        </div>
                    </div>
                    <div style="font-size: 1.25rem; color: var(--text-disabled); transition: transform 0.3s ease;" id="emergency-chevron">
                        <i class="fas fa-chevron-down"></i>
                    </div>
                </div>
            `;
            infoRow.appendChild(emergencyCard);
        }

        timeline.appendChild(infoRow);

        // --- National Helplines List (Below the row) ---
        const listContainer = document.createElement('div');
        listContainer.id = "national-emergency-list";
        listContainer.className = "hidden glass-card mb-4";
        listContainer.style = "padding: 1.5rem; background: rgba(239, 68, 68, 0.03); border: 1px dashed rgba(239, 68, 68, 0.2); animation: fadeInUp 0.4s ease;";
        listContainer.innerHTML = `
            <h4 style="margin-bottom: 1rem; color: var(--accent-red); display: flex; align-items: center; gap: 0.5rem;"><i class="fas fa-shield-halved"></i> India National Helplines</h4>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem;">
                ${data.national_helplines.map(h => `
                    <div style="display: flex; justify-content: space-between; background: rgba(0,0,0,0.2); padding: 0.75rem; border-radius: 8px; border: 1px solid var(--border-subtle);">
                        <span style="font-size: 0.85rem; color: var(--text-secondary);">${h.dept}</span>
                        <span style="font-weight: 700; color: var(--accent-red); font-family: monospace;">${h.phone}</span>
                    </div>
                `).join('')}
            </div>
        `;
        timeline.appendChild(listContainer);
    }

    if (data.days && data.days.length > 0) {
        data.days.forEach(day => {
            // Add Day Header
            const dayHeader = `
                <div class="day-header" style="margin-top: 2rem; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--border-subtle);">
                    <h3 style="color: var(--brand-primary); display: flex; align-items: center; gap: 0.5rem;">
                        <span style="background: var(--brand-primary); color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8rem;">D</span>
                        Day ${day.day_number}
                    </h3>
                </div>
                <div id="map-day-${day.day_number}" style="height: 300px; width: 100%; border-radius: 12px; margin-bottom: 1.5rem; border: 1px solid var(--border-subtle); display: none;"></div>
            `;
            timeline.insertAdjacentHTML('beforeend', dayHeader);

            // Inject Stay at the beginning of Day 1
            if (day.day_number === 1 && data.stay && data.stay.name) {
                const stayHTML = `
                    <div class="route-item" style="margin-bottom: 2rem;">
                        <div class="node" style="background: var(--accent-yellow); box-shadow: 0 0 10px rgba(var(--accent-yellow-rgb), 0.5); border-color: rgba(var(--accent-yellow-rgb), 0.2);"></div>
                        <div class="details" style="background: rgba(var(--accent-yellow-rgb), 0.05); border: 1px solid rgba(var(--accent-yellow-rgb), 0.1);">
                            <div style="font-size: 0.8rem; color: var(--accent-yellow); text-transform: uppercase; letter-spacing: 1px; font-weight: 600; margin-bottom: 0.25rem;">Check-in</div>
                            <h3 class="place-name">${data.stay.name}</h3>
                            <div class="meta" style="margin-top: 0.5rem; display: flex; gap: 1rem; flex-wrap: wrap;">
                                <span class="time">🏨 Accommodation</span>
                                <span class="rating" style="color: var(--accent-yellow);">⭐ ${data.stay.rating || 'N/A'}/5</span>
                                <span class="cost">₹${data.stay.price} total</span>
                            </div>
                        </div>
                    </div>
                `;
                timeline.insertAdjacentHTML('beforeend', stayHTML);
            }

            day.route.forEach((item, index) => {
                const isLast = (index === day.route.length - 1);

                const itemHTML = `
                    <div class="route-item">
                        <div class="node"></div>
                        <div class="details">
                            ${item.transport ? `
                                <div class="travel-bridge" style="
                                    background: rgba(var(--brand-primary-rgb), 0.05);
                                    border: 1px dashed rgba(var(--brand-primary-rgb), 0.2);
                                    border-radius: 8px;
                                    padding: 0.5rem 0.75rem;
                                    margin-bottom: 0.75rem;
                                    display: flex;
                                    justify-content: space-between;
                                    align-items: center;
                                    font-size: 0.75rem;
                                ">
                                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                                        <span style="font-size: 1rem; color: var(--brand-primary);"><i class="${getTransportIconClass(item.transport)}"></i></span>
                                        <span style="font-weight: 600; color: var(--text-primary); text-transform: uppercase;">Via ${item.transport}</span>
                                        <span style="color: var(--text-secondary); margin-left: 0.25rem;">• ${item.distance || '0'} km</span>
                                    </div>
                                    <div style="font-weight: 700; color: var(--brand-primary);">Est. ₹${item.travel_cost || '0'}</div>
                                </div>
                            ` : ''}
                            <span class="time">${item.time}</span>
                            <span class="place">${item.place}</span>
                            <div class="metadata" style="display: flex; gap: 1rem; align-items: center; margin-top: 0.25rem;">
                                <span class="rating" style="color: var(--accent-yellow);">⭐ ${item.rating || 'N/A'}/5</span>
                                ${item.cost ? `<span class="cost">₹${item.cost}</span>` : ''}
                            </div>
                        ${item.reviews && item.reviews.length > 0 ? `
                        <div class="reviews-box" style="margin-top: 0.75rem; font-size: 0.85rem; color: var(--text-secondary); background: rgba(255,255,255,0.03); padding: 0.75rem; border-radius: 6px;">
                            <p style="font-weight: 500; margin-bottom: 0.25rem; color: var(--text-primary);">Community Reviews:</p>
                            <ul style="list-style: none; padding-left: 0;">
                                ${item.reviews.slice(0, 2).map(r => `<li style="margin-bottom: 0.25rem;">" ${r} "</li>`).join('')}
                            </ul>
                        </div>
                        ` : ''}
                    </div>
                </div>
                ${!isLast ? '<div class="route-line"></div>' : ''}
            `;
            timeline.insertAdjacentHTML('beforeend', itemHTML);
            });
        });
    }
}

function getTransportIconClass(method) {
    const m = method.toLowerCase();
    if (m.includes('car')) return 'fa-solid fa-car-side';
    if (m.includes('bus')) return 'fa-solid fa-bus-simple';
    if (m.includes('train')) return 'fa-solid fa-train-subway';
    if (m.includes('flight') || m.includes('plane')) return 'fa-solid fa-plane-departure';
    if (m.includes('walk')) return 'fa-solid fa-person-walking';
    if (m.includes('bike') || m.includes('cycle')) return 'fa-solid fa-bicycle';
    if (m.includes('stay') || m.includes('hotel')) return 'fa-solid fa-hotel';
    return 'fa-solid fa-map-location-dot';
}

function resetGenerateBtn() {
    const submitBtn = document.getElementById('generate-btn');
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.querySelector('.btn-text').classList.remove('hidden');
        document.getElementById('generate-loader').classList.add('hidden');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // If on the dashboard and looking for a specific route automatically
    const params = new URLSearchParams(window.location.search);
    const targetRoute = params.get('route');
    if (targetRoute === 'experience') {
        showSection('experience-section');
    } else if (targetRoute === 'blog') {
        showSection('blog-section');
    }

    // Initialize first place card if container exists
    if (document.getElementById('places-container')) {
        addNextPlace();
    }
});

// ==========================================
// BLOG SECTION LOGIC
// ==========================================

let allBlogs = [];

function toggleBlogForm() {
    const formContainer = document.getElementById('create-blog-container');
    formContainer.classList.toggle('hidden');
    if (!formContainer.classList.contains('hidden')) {
        document.getElementById('create-blog-form').reset();
    }
}

async function fetchBlogs() {
    const feed = document.getElementById('blog-feed');
    feed.innerHTML = '<div style="text-align: center; grid-column: 1 / -1; padding: 3rem;"><div class="loader-spinner" style="margin: 0 auto; border-top-color: var(--brand-primary);"></div><p style="margin-top: 1rem; color: var(--text-secondary);">Loading community stories...</p></div>';
    
    try {
        const res = await fetch('/api/blogs');
        if (res.status === 401) { window.location.href = '/login'; return; }
        allBlogs = await res.json();
        renderBlogFeed(allBlogs);
    } catch (err) {
        console.error(err);
        feed.innerHTML = '<p style="color: var(--accent-red); grid-column: 1/-1; text-align: center;">Failed to load blogs.</p>';
    }
}

function filterBlogs() {
    const searchTerm = document.getElementById('blog-search').value.toLowerCase();
    const category = document.getElementById('blog-category-filter').value;
    
    const filtered = allBlogs.filter(b => {
        const matchesSearch = b.title.toLowerCase().includes(searchTerm) || b.content.toLowerCase().includes(searchTerm);
        const matchesCategory = category === 'All' || b.category === category;
        return matchesSearch && matchesCategory;
    });
    
    renderBlogFeed(filtered);
}

function renderBlogFeed(blogs) {
    const feed = document.getElementById('blog-feed');
    feed.innerHTML = '';
    
    if (blogs.length === 0) {
        feed.innerHTML = '<p style="color: var(--text-secondary); grid-column: 1/-1; text-align: center;">No stories found. Be the first to share one!</p>';
        return;
    }
    
    blogs.forEach(blog => {
        const card = document.createElement('div');
        card.className = 'glass-card action-card';
        card.style.cssText = 'padding: 0; overflow: hidden; display: flex; flex-direction: column; cursor: pointer; text-align: left; transition: transform 0.2s, box-shadow 0.2s;';
        card.onclick = () => window.location.href = `/blog/${blog.blog_id}`;
        
        let imgHtml = '';
        if (blog.images && blog.images.length > 0) {
            imgHtml = `<div style="height: 180px; width: 100%; background: url('${blog.images[0]}') center/cover;"></div>`;
        } else {
            imgHtml = `<div style="height: 180px; width: 100%; background: linear-gradient(45deg, var(--bg-surface), rgba(239, 68, 68, 0.1)); display: flex; align-items: center; justify-content: center;"><span style="font-size: 3rem;">✍️</span></div>`;
        }
        
        card.innerHTML = `
            ${imgHtml}
            <div style="padding: 1.5rem; flex: 1; display: flex; flex-direction: column;">
                <span style="font-size: 0.75rem; color: var(--brand-primary); font-weight: 600; text-transform: uppercase;">${blog.category}</span>
                <h3 style="margin: 0.5rem 0; font-size: 1.25rem;">${blog.title}</h3>
                <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1rem; flex: 1;">${blog.short_description || blog.content.substring(0, 100) + '...'}</p>
                
                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-subtle); padding-top: 1rem; margin-top: auto;">
                    <span style="font-size: 0.8rem; color: var(--text-disabled);">${blog.author_name} • ${blog.created_at.split(' ')[0]}</span>
                    <div style="font-size: 0.85rem; display: flex; gap: 0.5rem; color: var(--text-secondary);">
                        <span style="color: ${blog.liked_by_me ? 'var(--accent-red)' : ''}">❤️ ${blog.likes_count}</span>
                        <span>💬 ${blog.comments_count}</span>
                    </div>
                </div>
            </div>
        `;
        feed.appendChild(card);
    });
}

async function submitBlog(e) {
    e.preventDefault();
    const btn = document.getElementById('blog-submit-btn');
    btn.disabled = true;
    btn.textContent = 'Publishing...';
    
    const form = e.target;
    const formData = new FormData(form);
    
    try {
        const res = await fetch('/api/blogs', {
            method: 'POST',
            body: formData
        });
        
        if (!res.ok) throw new Error("Failed to post blog");
        
        toggleBlogForm();
        fetchBlogs(); // Reload feed
    } catch (err) {
        alert("Error publishing blog.");
        console.error(err);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Publish Post';
    }
}

// Modal Logic
function openBlogModal(blog) {
    const modal = document.getElementById('blog-modal');
    const backdrop = document.getElementById('blog-modal-backdrop');
    const content = document.getElementById('blog-modal-content');
    
    let primaryImageHtml = '';
    let otherImagesHtml = '';
    if (blog.images && blog.images.length > 0) {
        // Main Image (below author)
        primaryImageHtml = `
            <div style="width: 100%; margin: 2.5rem 0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                <img src="${blog.images[0]}" style="width: 100%; max-height: 500px; object-fit: cover; display: block;">
            </div>
        `;
        
        // Other images if any
        if (blog.images.length > 1) {
            otherImagesHtml = `<div style="display: flex; flex-direction: column; gap: 2rem; margin: 3rem 0;">`;
            for(let i=1; i<blog.images.length; i++) {
                otherImagesHtml += `<img src="${blog.images[i]}" style="width: 100%; max-height: 500px; border-radius: 8px; object-fit: cover; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">`;
            }
            otherImagesHtml += `</div>`;
        }
    }
    
    content.innerHTML = `
        <!-- Title and Subtitle -->
        <div style="margin-bottom: 2rem; text-align: left;">
            <span style="font-size: 0.85rem; color: var(--brand-primary); font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">${blog.category}</span>
            <h1 style="font-size: 3rem; margin-top: 1rem; margin-bottom: 0.5rem; color: var(--text-primary); line-height: 1.2; font-weight: 800;">${blog.title}</h1>
            <p style="font-size: 1.25rem; color: var(--text-secondary); margin: 0; line-height: 1.5;">${blog.short_description || ''}</p>
        </div>
        
        <!-- Author Block & Actions -->
        <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 1.5rem; border-bottom: 1px solid var(--border-subtle); margin-bottom: 1rem;">
            <div style="display: flex; align-items: center; gap: 1rem;">
                <div style="width: 48px; height: 48px; border-radius: 50%; background: var(--brand-primary); color: white; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; font-weight: bold;">
                    ${blog.author_name.charAt(0)}
                </div>
                <div>
                    <p style="margin: 0; font-weight: 600; color: var(--text-primary); font-size: 1.05rem;">${blog.author_name}</p>
                    <p style="margin: 0; font-size: 0.9rem; color: var(--text-secondary);">${blog.created_at.split(' ')[0]} • 5 min read</p>
                </div>
            </div>
            
            <div style="display: flex; gap: 0.8rem; align-items: center;">
                <button class="btn btn-secondary" style="padding: 0.4rem 1rem; border-radius: 20px; border-color: ${blog.liked_by_me ? 'var(--accent-red)' : 'var(--border-subtle)'}; color: ${blog.liked_by_me ? 'var(--accent-red)' : 'var(--text-secondary)'}; background: transparent; " onclick="toggleLike(${blog.blog_id}, this)">
                    ${blog.liked_by_me ? '❤️ Liked' : '🤍 Like'} (<span id="modal-likes-count">${blog.likes_count}</span>)
                </button>
                <button class="btn btn-secondary" style="color: var(--accent-red); border-color: var(--accent-red); border-radius: 20px; padding: 0.4rem 1rem; background: transparent;" onclick="deleteBlog(${blog.blog_id})">Delete</button>
            </div>
        </div>
        
        ${primaryImageHtml}
        
        <!-- Blog Content Text -->
        <div style="font-size: 1.15rem; line-height: 1.9; color: var(--text-primary); font-weight: 400; margin-bottom: 3rem; white-space: pre-wrap; font-family: 'Georgia', serif;">
            ${blog.content}
        </div>
        
        ${otherImagesHtml}
        
        <!-- Discussion -->
        <div style="border-top: 1px solid var(--border-subtle); padding-top: 3rem; margin-bottom: 2rem;">
            <h3 style="font-size: 1.5rem; margin-bottom: 1.5rem;">Responses (<span id="modal-comments-count">${blog.comments_count}</span>)</h3>
            <div id="comments-container" style="display: flex; flex-direction: column; gap: 1.5rem;">
                <div class="loader-spinner" style="border-top-color: var(--brand-primary);"></div>
            </div>
        </div>
    `;
    
    modal.classList.remove('hidden');
    backdrop.classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // prevent bg scroll
    
    loadComments(blog.blog_id);
}

function closeBlogModal() {
    document.getElementById('blog-modal').classList.add('hidden');
    document.getElementById('blog-modal-backdrop').classList.add('hidden');
    document.body.style.overflow = '';
}

async function toggleLike(blogId, btnObj) {
    try {
        const res = await fetch(`/api/blogs/${blogId}/like`, { method: 'POST' });
        if (res.status === 401) return window.location.href = '/login';
        if (!res.ok) throw new Error();
        const data = await res.json();
        
        // Update Modal UI immediately
        const countSpan = document.getElementById('modal-likes-count');
        countSpan.textContent = data.likes_count;
        if (data.action === 'liked') {
            btnObj.innerHTML = `❤️ Liked (<span id="modal-likes-count">${data.likes_count}</span>)`;
            btnObj.style.color = 'var(--accent-red)';
            btnObj.style.borderColor = 'var(--accent-red)';
        } else {
            btnObj.innerHTML = `🤍 Like (<span id="modal-likes-count">${data.likes_count}</span>)`;
            btnObj.style.color = '';
            btnObj.style.borderColor = '';
        }
        
        // Refresh base feed passively to sync
        fetchBlogs();
    } catch (e) { console.error('Error toggling like'); }
}

async function deleteBlog(blogId) {
    if (!confirm('Are you sure you want to delete this post? This cannot be undone.')) return;
    try {
        const res = await fetch(`/api/blogs/${blogId}`, { method: 'DELETE' });
        if (res.status === 403) return alert('You do not have permission to delete this post.');
        if (!res.ok) throw new Error();
        
        closeBlogModal();
        fetchBlogs();
    } catch (e) { alert('Error deleting blog'); }
}

async function loadComments(blogId) {
    const container = document.getElementById('comments-container');
    try {
        const res = await fetch(`/api/blogs/${blogId}/comments`);
        const comments = await res.json();
        
        container.innerHTML = '';
        if (comments.length === 0) {
            container.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.9rem;">No comments yet. Be the first to start the discussion!</p>';
            return;
        }
        
        comments.forEach(c => {
            container.innerHTML += `
                <div style="background: rgba(255,255,255,0.03); padding: 1rem; border-radius: var(--radius-sm);">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                        <span style="font-weight: 600; font-size: 0.95rem;">${c.author_name}</span>
                        <span style="font-size: 0.8rem; color: var(--text-disabled);">${c.created_at}</span>
                    </div>
                    <p style="font-size: 0.95rem; color: var(--text-secondary); margin: 0;">${c.comment_text}</p>
                </div>
            `;
        });
    } catch (e) {
        container.innerHTML = '<p style="color: var(--accent-red);">Failed to load comments.</p>';
    }
}

async function submitComment(e, blogId) {
    e.preventDefault();
    const btn = document.getElementById('comment-btn');
    const input = document.getElementById('new-comment-text');
    const text = input.value.trim();
    if (!text) return;
    
    btn.disabled = true;
    try {
        const res = await fetch(`/api/blogs/${blogId}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ comment_text: text })
        });
        if (res.status === 401) return window.location.href = '/login';
        if (!res.ok) throw new Error();
        
        input.value = '';
        loadComments(blogId);
        
        // Optimistically increment modal counter
        const countSpan = document.getElementById('modal-comments-count');
        countSpan.textContent = parseInt(countSpan.textContent) + 1;
        fetchBlogs(); // Sync generic feed
    } catch (err) {
        alert('Failed to post comment');
    } finally {
        btn.disabled = false;
    }
}

// ==========================================
// WANDERSNAPS LOGIC
// ==========================================
const snapsData = [
    { id: 0, title: "Munnar Bliss", img: "/static/snaps/munnar.png", user: "Arjun S.", caption: "Waking up to these misty peaks is a dream come true! 🏔️" },
    { id: 1, title: "Golden Hour", img: "/static/snaps/teagarden.png", user: "Meera K.", caption: "Tea gardens look magical when the sun starts to dip. 🍵✨" },
    { id: 2, title: "Vembanad", img: "/static/snaps/backwaters.png", user: "Rahul V.", caption: "Cruising through the backwaters. Pure serenity. 🛶" },
    { id: 3, title: "Houseboat", img: "https://images.unsplash.com/photo-1593693397690-362cb9666fc2?auto=format&fit=crop&w=800&q=80", user: "Community", caption: "The classic Kerala experience. Must try once! 🌴" }
];

let currentSnapIndex = 0;
let snapTimer = null;
let progressInterval = null;
const SNAP_DURATION = 5000; // 5 seconds per snap

function openSnap(index) {
    currentSnapIndex = index;
    const viewer = document.getElementById('wandersnaps-viewer');
    viewer.classList.remove('hidden');
    
    renderProgressBars();
    renderSnap();
}

function closeSnap() {
    const viewer = document.getElementById('wandersnaps-viewer');
    viewer.classList.add('hidden');
    clearTimeout(snapTimer);
    clearInterval(progressInterval);
}

function renderSnap() {
    const snap = snapsData[currentSnapIndex];
    if (!snap) {
        closeSnap();
        return;
    }
    
    document.getElementById('viewer-img').src = snap.img;
    document.getElementById('viewer-user-name').innerText = snap.user;
    document.getElementById('viewer-caption').innerText = snap.caption;
    
    // Render progress bars
    const progressContainer = document.getElementById('viewer-progress-bars');
    progressContainer.innerHTML = '';
    snapsData.forEach((_, i) => {
        const bar = document.createElement('div');
        bar.className = 'progress-bar';
        const fill = document.createElement('div');
        fill.className = 'progress-fill';
        if (i < currentSnapIndex) fill.style.width = '100%';
        if (i === currentSnapIndex) fill.id = 'current-progress-fill';
        bar.appendChild(fill);
        progressContainer.appendChild(bar);
    });
    
    startSnapTimer();
}

function startSnapTimer() {
    clearTimeout(snapTimer);
    clearInterval(progressInterval);
    
    let progress = 0;
    const fillEl = document.getElementById('current-progress-fill');
    
    progressInterval = setInterval(() => {
        progress += (100 / (SNAP_DURATION / 100));
        if (fillEl) fillEl.style.width = `${Math.min(progress, 100)}%`;
    }, 100);
    
    snapTimer = setTimeout(() => {
        nextSnap();
    }, SNAP_DURATION);
}

function nextSnap() {
    if (currentSnapIndex < snapsData.length - 1) {
        currentSnapIndex++;
        renderSnap();
    } else {
        closeSnap();
    }
}

function prevSnap() {
    if (currentSnapIndex > 0) {
        currentSnapIndex--;
        renderSnap();
    } else {
        renderSnap();
    }
}

function triggerAddSnap() {
    document.getElementById('create-snap-modal').classList.remove('hidden');
}

function closeCreateSnap() {
    document.getElementById('create-snap-modal').classList.add('hidden');
    document.getElementById('create-snap-form').reset();
    document.getElementById('snap-preview-img').src = '/static/logo.png';
}

function previewSnapImage(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('snap-preview-img').src = e.target.result;
        }
        reader.readAsDataURL(file);
    }
}

function finalizeAddSnap(event) {
    event.preventDefault();
    
    const caption = document.getElementById('snap-caption').value;
    const userName = document.getElementById('snap-user-name').value;
    const imgSrc = document.getElementById('snap-preview-img').src;
    
    const newId = snapsData.length;
    snapsData.push({
        id: newId,
        title: caption.substring(0, 15),
        img: imgSrc,
        user: userName,
        caption: caption
    });
    
    const container = document.getElementById('wandersnaps-container');
    const newSnapHTML = `
        <div class="snap-item" onclick="openSnap(${newId})">
            <div class="snap-circle">
                <img src="${imgSrc}" alt="${caption}">
            </div>
            <span class="snap-label">${caption.substring(0, 10)}...</span>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', newSnapHTML);
    
    closeCreateSnap();
    
    const lastSnap = container.lastElementChild;
    lastSnap.style.transform = 'scale(1.2)';
    setTimeout(() => {
        lastSnap.style.transform = 'scale(1)';
    }, 500);
}


// ==========================================
// 3D SCROLL EFFECT LOGIC
// ==========================================
function initScroll3D() {
    const mainContainer = document.querySelector('.dashboard-container');
    const scrollElements = document.querySelectorAll('.scroll-3d-element');

    if (!mainContainer || scrollElements.length === 0) return;

    const handleScroll = () => {
        const windowHeight = window.innerHeight;
        const scrollY = window.scrollY || window.pageYOffset;

        scrollElements.forEach(el => {
            // Skip hidden elements to save performance
            if (el.classList.contains('hidden')) return;

            const rect = el.getBoundingClientRect();
            const elementCenter = rect.top + rect.height / 2;
            const viewportCenter = windowHeight / 2;
            
            // Distance from viewport center (-1 to 1)
            let distanceFromCenter = (elementCenter - viewportCenter) / (windowHeight / 1.5);
            
            // Clamp values
            distanceFromCenter = Math.max(-1.5, Math.min(1.5, distanceFromCenter));
            
            const absDistance = Math.abs(distanceFromCenter);
            
            // Apply 3D transformations
            // 1. Scale down slightly as it moves away from center
            const scale = 1 - (absDistance * 0.1); 
            
            // 2. TranslateZ (push back in space)
            const translateZ = -absDistance * 100;
            
            // 3. Subtle rotation based on scroll position
            const rotateX = distanceFromCenter * 5;
            
            // 4. Fade out at edges (REMOVED: Keeping everything 100% opaque)
            // const opacity = 1 - (absDistance * 0.4);

            el.style.transform = `translateZ(${translateZ}px) rotateX(${rotateX}deg) scale(${scale})`;
            el.style.opacity = 1;
        });
    };

    window.addEventListener('scroll', () => {
        window.requestAnimationFrame(handleScroll);
    }, { passive: true });

    // Initial trigger
    handleScroll();
}

// Ensure 3D scroll is re-initialized when sections change
const originalShowSection = showSection;
showSection = function(sectionId) {
    originalShowSection(sectionId);
    setTimeout(initScroll3D, 50); // Small delay to let DOM settle
};

// Initialize on first load
document.addEventListener('DOMContentLoaded', () => {
    initScroll3D();
    fetchUserProfile();
});

// --- Calendar Logic ---
let currentCalendarDate = new Date();
let calendarEvents = JSON.parse(localStorage.getItem('wanderSyncEvents')) || {};

function initCalendar() {
    const grid = document.getElementById('calendar-grid');
    const title = document.getElementById('current-month-year');
    if (!grid || !title) return;

    grid.innerHTML = '';
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();

    title.innerText = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(currentCalendarDate);

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Fill blanks
    for (let i = 0; i < firstDay; i++) {
        const blank = document.createElement('div');
        blank.className = 'calendar-day empty';
        grid.appendChild(blank);
    }

    // Fill days
    const today = new Date();
    for (let d = 1; d <= daysInMonth; d++) {
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day';
        if (year === today.getFullYear() && month === today.getMonth() && d === today.getDate()) {
            dayEl.classList.add('today');
        }

        const dateKey = `${year}-${month + 1}-${d}`;
        dayEl.onclick = () => openEventModal(dateKey);

        const numSpan = document.createElement('span');
        numSpan.className = 'day-number';
        numSpan.innerText = d;
        dayEl.appendChild(numSpan);

        // Show dots if events exist
        if (calendarEvents[dateKey] && calendarEvents[dateKey].length > 0) {
            const dots = document.createElement('div');
            dots.className = 'event-dots';
            calendarEvents[dateKey].slice(0, 3).forEach(() => {
                const dot = document.createElement('div');
                dot.className = 'event-dot';
                dots.appendChild(dot);
            });
            dayEl.appendChild(dots);
        }

        grid.appendChild(dayEl);
    }
}

function changeMonth(offset) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + offset);
    initCalendar();
}

let activeDateKey = null;

function openEventModal(dateKey) {
    activeDateKey = dateKey;
    const modal = document.getElementById('event-modal');
    const overlay = document.getElementById('event-modal-overlay');
    const title = document.getElementById('modal-date-title');
    
    title.innerText = `Events on ${dateKey}`;
    renderEventList();

    modal.classList.remove('hidden');
    overlay.classList.remove('hidden');
}

function renderEventList() {
    const list = document.getElementById('event-list-container');
    list.innerHTML = '';
    const events = calendarEvents[activeDateKey] || [];

    if (events.length === 0) {
        list.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.9rem;">No events scheduled.</p>';
        return;
    }

    events.forEach((text, index) => {
        const item = document.createElement('div');
        item.className = 'calendar-event-item';
        item.innerHTML = `
            <span>${text}</span>
            <span class="delete-event-btn" onclick="deleteCalendarEvent(${index})">&times;</span>
        `;
        list.appendChild(item);
    });
}

function saveCalendarEvent(e) {
    e.preventDefault();
    const input = document.getElementById('event-text');
    const text = input.value.trim();
    if (!text) return;

    if (!calendarEvents[activeDateKey]) calendarEvents[activeDateKey] = [];
    calendarEvents[activeDateKey].push(text);
    localStorage.setItem('wanderSyncEvents', JSON.stringify(calendarEvents));

    input.value = '';
    renderEventList();
    initCalendar(); // Update dots
}

function deleteCalendarEvent(index) {
    calendarEvents[activeDateKey].splice(index, 1);
    if (calendarEvents[activeDateKey].length === 0) delete calendarEvents[activeDateKey];
    localStorage.setItem('wanderSyncEvents', JSON.stringify(calendarEvents));
    renderEventList();
    initCalendar();
}

function closeEventModal() {
    document.getElementById('event-modal').classList.add('hidden');
    document.getElementById('event-modal-overlay').classList.add('hidden');
}
function toggleGuideFields() {
    const section = document.getElementById('guide-details-section');
    const checked = document.getElementById('exp_has_guides').checked;
    if (checked) {
        section.classList.remove('hidden');
    } else {
        section.classList.add('hidden');
    }
}
function toggleEmergencyFields() {
    const section = document.getElementById('emergency-details-section');
    const checked = document.getElementById('exp_has_emergency').checked;
    if (checked) {
        section.classList.remove('hidden');
    } else {
        section.classList.add('hidden');
    }
}
function toggleEmergencyList() {
    const list = document.getElementById('national-emergency-list');
    const chevron = document.getElementById('emergency-chevron');
    if (!list) return;
    
    const isHidden = list.classList.contains('hidden');
    if (isHidden) {
        list.classList.remove('hidden');
        if (chevron) chevron.style.transform = 'rotate(180deg)';
    } else {
        list.classList.add('hidden');
        if (chevron) chevron.style.transform = 'rotate(0deg)';
    }
}

// --- Gamification Logic ---

const ACHIEVEMENTS = {
    'novice_wanderer': { title: 'First Steps', icon: '<i class="fa-solid fa-person-hiking"></i>', desc: 'Planned your first trip' },
    'storyteller': { title: 'Storyteller', icon: '<i class="fa-solid fa-feather-pointed"></i>', desc: 'Shared your first travel blog' },
    'helper': { title: 'Contributor', icon: '<i class="fa-solid fa-hand-holding-heart"></i>', desc: 'Logged a past trip' },
    'explorer': { title: 'Elite Explorer', icon: '<i class="fa-solid fa-mountain-sun"></i>', desc: 'Reached Level 4' }
};

async function fetchUserProfile() {
    try {
        const res = await fetch('/api/user/profile');
        if (res.ok) {
            const data = await res.json();
            renderUserProfile(data);
        }
    } catch (err) {
        console.error("Error fetching profile:", err);
    }
}

function renderUserProfile(data) {
    const infoBox = document.getElementById('user-gamification-info');
    const badge = document.getElementById('user-level-badge');
    const xpText = document.getElementById('user-xp-text');
    const xpFill = document.getElementById('user-xp-fill');
    
    // Update Gamification Widget (Dashboard)
    if (infoBox) {
        badge.innerText = `Level ${data.level.level}: ${data.level.title}`;
        xpText.innerText = `${data.points} / ${data.level.xp_next} XP`;
        const range = data.level.xp_next - data.level.xp_min;
        const current = data.points - data.level.xp_min;
        const progress = (current / range) * 100;
        setTimeout(() => {
            xpFill.style.width = `${Math.min(100, Math.max(5, progress))}%`;
            infoBox.style.opacity = '1';
        }, 100);
    }
    
    // Update Profile Section (LinkedIn Style)
    const profileSection = document.getElementById('profile-section');
    if (profileSection) {
        document.getElementById('profile-name').innerText = data.full_name;
        document.getElementById('profile-headline').innerText = data.headline || "Explorer & Travel Enthusiast";
        document.getElementById('profile-loc-text').innerText = data.location || "Global Citizen";
        document.getElementById('profile-bio').innerText = data.bio || "No bio added yet. Share your travel philosophy with the community!";
        
        if (data.profile_pic) document.getElementById('profile-pic-img').src = data.profile_pic;
        if (data.cover_pic) document.getElementById('profile-cover-img').src = data.cover_pic;
        
        document.getElementById('stat-trips').innerText = data.stats.total_trips;
        document.getElementById('stat-points').innerText = data.points;
        document.getElementById('stat-level').innerText = data.level.level;
        
        // Populate edit modal
        document.getElementById('edit-headline').value = data.headline || '';
        document.getElementById('edit-location').value = data.location || '';
        document.getElementById('edit-bio').value = data.bio || '';
        document.getElementById('edit-disability').value = data.disability_info || '';
    }
    
    // Update Achievements
    renderAchievements(data.points, data.achievements);
}

function renderAchievements(points, unlocked) {
    const container = document.getElementById('achievements-container');
    const section = document.getElementById('achievements-section');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Define logic for unlocking mock achievements based on points
    const list = [];
    if (points >= 25) list.push(ACHIEVEMENTS.novice_wanderer);
    if (points >= 50) list.push(ACHIEVEMENTS.helper);
    if (points >= 150) list.push(ACHIEVEMENTS.storyteller);
    if (points >= 600) list.push(ACHIEVEMENTS.explorer);
    
    if (list.length > 0) {
        section.style.opacity = '1';
        list.forEach(ach => {
            const el = document.createElement('div');
            el.className = 'glass-card achievement-item';
            el.style = `
                width: 100px; 
                height: 120px; 
                display: flex; 
                flex-direction: column; 
                align-items: center; 
                justify-content: center; 
                text-align: center; 
                padding: 0.75rem;
                background: rgba(255,255,255,0.03);
                border: 1px solid var(--border-subtle);
                border-radius: 20px;
                transition: transform 0.3s ease;
                cursor: help;
            `;
            el.title = ach.desc;
            el.innerHTML = `
                <div style="font-size: 2rem; margin-bottom: 0.5rem; color: var(--brand-primary);">${ach.icon}</div>
                <div style="font-size: 0.65rem; font-weight: 800; color: var(--text-primary); text-transform: uppercase; letter-spacing: 1px;">${ach.title}</div>
            `;
            
            // Hover effect
            el.onmouseenter = () => el.style.transform = 'scale(1.1) translateY(-5px)';
            el.onmouseleave = () => el.style.transform = 'scale(1) translateY(0)';
            
            container.appendChild(el);
        });
    }

    // Mini Achievements for Profile
    const miniContainer = document.getElementById('profile-achievements-list');
    if (miniContainer) {
        miniContainer.innerHTML = '';
        list.forEach(ach => {
            const badge = document.createElement('div');
            badge.style = "font-size: 1rem; background: rgba(255,255,255,0.05); padding: 0.5rem; border-radius: 50%; border: 1px solid var(--border-subtle); width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; color: var(--brand-primary);";
            badge.title = ach.title;
            badge.innerHTML = ach.icon;
            miniContainer.appendChild(badge);
        });
    }
}

// --- Profile Edit & Image Handlers ---

function openProfileEdit() {
    toggleModal('profile-edit-modal', true);
}

function toggleModal(id, show) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.toggle('hidden', !show);
    }
}

async function saveProfileChanges() {
    const headline = document.getElementById('edit-headline').value;
    const location = document.getElementById('edit-location').value;
    const disability_info = document.getElementById('edit-disability').value;
    
    try {
        const res = await fetch('/api/user/profile', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ headline, location, bio, disability_info })
        });
        
        if (res.ok) {
            toggleModal('profile-edit-modal', false);
            fetchUserProfile(); // Refresh data
        }
    } catch (err) {
        console.error("Error saving profile:", err);
    }
}

async function handleImageUpload(event, type) {
    const file = event.target.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('image', file);
    formData.append('type', type);
    
    try {
        const res = await fetch('/api/user/profile/upload', {
            method: 'POST',
            body: formData
        });
        
        if (res.ok) {
            const data = await res.json();
            if (type === 'profile') document.getElementById('profile-pic-img').src = data.url;
            else document.getElementById('profile-cover-img').src = data.url;
        }
    } catch (err) {
        console.error("Error uploading image:", err);
    }
}
