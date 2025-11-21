const NodeHelper = require("node_helper");
const axios = require("axios");

module.exports = NodeHelper.create({
    start: function () {
        this.config = {};
        this.lastShellyFetch = 0;
        this.shellyInterval = null;
        this.froniusInterval = null;
        this.isFetchingShelly = false; // Lock für Shelly-Abfragen
    },

    socketNotificationReceived: function (notification, payload) {
        if (notification === "MMM-FroniusSolar4_CONFIG") {
            this.config = payload;

            // Clear existing intervals if they exist
            clearInterval(this.froniusInterval);
            clearInterval(this.shellyInterval);

            // Start intervals for Fronius and Shelly
            if (this.config.updateInterval) {
                this.startFroniusUpdates();
            }
            if (this.config.updateIntervalShelly) {
                this.startShellyUpdates();
            }
        }
    },

    startFroniusUpdates: function () {
        this.froniusInterval = setInterval(async () => {
            try {
                const froniusData = await this.fetchFroniusData();
                this.sendSocketNotification("MMM-FroniusSolar4_FRONIUS_DATA", froniusData);
            } catch (error) {
                console.error("[MMM-FroniusSolar4] Error fetching Fronius data:", error.message || error);
            }
        }, this.config.updateInterval);
    },

    startShellyUpdates: function () {
        this.shellyInterval = setInterval(async () => {
            const now = Date.now();
            if (now - this.lastShellyFetch < this.config.updateIntervalShelly) {
                return;
            }
            
            // Verhindere parallele Ausführungen
            if (this.isFetchingShelly) {
                console.log("[MMM-FroniusSolar4] Shelly fetch already in progress, skipping...");
                return;
            }
            
            this.lastShellyFetch = now;
            this.isFetchingShelly = true;

            try {
                const shellyData = await this.fetchShellyPVStatus();
                this.sendSocketNotification("MMM-FroniusSolar4_SHELLY_DATA", shellyData);
            } catch (error) {
                console.error("[MMM-FroniusSolar4] Error fetching Shelly data:", error.message || error);
            } finally {
                this.isFetchingShelly = false;
            }
        }, 1000);
    },

    fetchFroniusData: async function () {
        try {
            if (!this.config.InverterIP) {
                throw new Error("InverterIP is not defined.");
            }

            const serverUriFronius = `http://${this.config.InverterIP}/solar_api/v1/GetPowerFlowRealtimeData.fcgi`;
            const response = await axios.get(serverUriFronius);
            const data = response.data;

            return {
                P_Akku: data.Body?.Data?.Site?.P_Akku || 0,
                P_Grid: data.Body?.Data?.Site?.P_Grid || 0,
                P_Load: data.Body?.Data?.Site?.P_Load || 0,
                P_PV: data.Body?.Data?.Site?.P_PV || 0,
                SOC: data.Body?.Data?.Inverters?.["1"]?.SOC || 0,
            };
        } catch (error) {
            console.error("[MMM-FroniusSolar4] Error in fetchFroniusData:", error.message || error);
            return { P_Akku: 0, P_Grid: 0, P_Load: 0, P_PV: 0, SOC: 0 };
        }
    },

    fetchShellyPVStatus: async function () {
        const results = [];
        let totalShellyPower = 0;

        if (!this.config.shellysPV || !Array.isArray(this.config.shellysPV)) {
            return { devices: [], totalPower: 0 };
        }

        console.log(`[MMM-FroniusSolar4] Starting sequential fetch for ${this.config.shellysPV.length} Shelly devices...`);

        // Sequential statt parallel - nacheinander abfragen
        for (const shellyPV of this.config.shellysPV) {
            let retryCount = 0;
            const maxRetries = 1;
            
            while (retryCount <= maxRetries) {
                try {
                    console.log(`[MMM-FroniusSolar4] Fetching status for ${shellyPV.name} (ID: ${shellyPV.id})...`);
                    
                    const response = await axios.post(
                        `${this.config.serverUriShelly}/device/status`,
                        `id=${shellyPV.id}&auth_key=${this.config.authKey}`,
                        { 
                            headers: { "Content-Type": "application/x-www-form-urlencoded" },
                            timeout: 10000
                        }
                    );

                    const data = response.data?.data?.device_status;

                    if (data) {
                        let power = 0;

                        if (data.relays) {
                            const channel = parseInt(shellyPV.ch || 0, 10);
                            power = data.meters?.[channel]?.power || 0;
                        } else if (data["pm1:0"]) {
                            power = data["pm1:0"].apower || 0;
                        } else if (data["switch:0"]) {
                            power = data["switch:0"].apower || 0;
                        } else if (data.lights) {
                            power = data.meters ? data.meters[0].power || 0 : 0;
                        }

                        totalShellyPower += power;

                        results.push({
                            name: shellyPV.name,
                            power: power,
                        });
                        
                        console.log(`[MMM-FroniusSolar4] ✓ Successfully fetched ${shellyPV.name}: ${power}W`);
                    } else {
                        console.warn(`[MMM-FroniusSolar4] ✗ No device status data received for ${shellyPV.name}`);
                        results.push({
                            name: shellyPV.name,
                            power: null,
                        });
                    }
                    
                    break; // Erfolg - aus der while-Schleife ausbrechen
                    
                } catch (error) {
                    if (error.response?.status === 429 && retryCount < maxRetries) {
                        console.error(`[MMM-FroniusSolar4] ✗ Rate limit hit for ${shellyPV.name} (Retry ${retryCount + 1}/${maxRetries})`);
                        
                        console.log("[MMM-FroniusSolar4] Waiting 11 seconds before retry...");
                        await new Promise(resolve => setTimeout(resolve, 11000));
                        retryCount++;
                        continue; // Nochmal versuchen
                    } else {
                        if (error.response?.status === 429) {
                            console.error(`[MMM-FroniusSolar4] ✗ Rate limit hit for ${shellyPV.name} - no more retries`);
                        } else {
                            console.error(`[MMM-FroniusSolar4] ✗ Error fetching status for ${shellyPV.name}:`, error.message);
                        }
                        
                        results.push({
                            name: shellyPV.name,
                            power: null,
                        });
                        break;
                    }
                }
            }
            
            // 3 Sekunden Delay zwischen den Geräten
            if (this.config.shellysPV.indexOf(shellyPV) < this.config.shellysPV.length - 1) {
                console.log("[MMM-FroniusSolar4] Waiting 3 seconds before next device...");
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }

        console.log(`[MMM-FroniusSolar4] ✅ Completed fetching all ${results.length} Shelly devices`);
        return {
            devices: results,
            totalPower: totalShellyPower,
        };
    },
});
