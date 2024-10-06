import React, { useEffect, useState } from 'react';
import './App.css';

const App = () => {
  const clientId = "76980b1b4890437fbb58cf3de124a778";

  const [profileData, setProfileData] = useState(null);
  const [playlists, setPlaylists] = useState([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [selectedPlaylistTracks, setSelectedPlaylistTracks] = useState([]);
  const [accessToken, setAccessToken] = useState(null);
  const [newPlaylistId, setNewPlaylistId] = useState(null);
  const [deletedSongs, setDeletedSongs] = useState([]);
  const [trackFeatures, setTrackFeatures] = useState([]);

  const minSoundRange = 0.3; 
  const maxSoundRange = 0.7;
  const minPlaylistLength = 10; 
  const maxPlaylistLength = 50; 

  const generateCodeVerifier = (length) => {
    let text = '';
    let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  };

  const generateCodeChallenge = async (codeVerifier) => {
    const data = new TextEncoder().encode(codeVerifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode.apply(null, [...new Uint8Array(digest)]))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  };

  const redirectToAuthCodeFlow = async (clientId) => {
    const verifier = generateCodeVerifier(128);
    const challenge = await generateCodeChallenge(verifier);

    localStorage.setItem("verifier", verifier);

    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("response_type", "code");
    params.append("redirect_uri", "http://localhost:3000/callback");
    params.append("scope", "user-read-private user-read-email playlist-read-private playlist-modify-public playlist-modify-private user-top-read");
    params.append("code_challenge_method", "S256");
    params.append("code_challenge", challenge);

    document.location = `https://accounts.spotify.com/authorize?${params.toString()}`;
  };

  const fetchProfile = async (token) => {
    setAccessToken(token);

    try {
      const profileResult = await fetch("https://api.spotify.com/v1/me", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (profileResult.ok) {
        const profile = await profileResult.json();

        const playlistsResult = await fetch("https://api.spotify.com/v1/me/playlists", {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });

        if (playlistsResult.ok) {
          let playlistsData = await playlistsResult.json();
          playlistsData = playlistsData.items.filter(playlist => 
            playlist.tracks.total >= minPlaylistLength && playlist.tracks.total <= maxPlaylistLength
          );
          setPlaylists(playlistsData);
        } else {
          console.error("Error fetching playlists:", playlistsResult.status, playlistsResult.statusText);
        }

        return profile;
      } else {
        console.error("Error fetching profile:", profileResult.status, profileResult.statusText);
        return null;
      }
    } catch (error) {
      console.error("Error during fetch:", error);
      return null;
    }
  };

  const fetchPlaylistTracks = async (playlistId) => {
    try {
      const tracksResult = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (tracksResult.ok) {
        const tracksData = await tracksResult.json();
        setSelectedPlaylistTracks(tracksData.items);
        fetchAudioFeatures(tracksData.items.map(track => track.track.id));
      } else {
        console.error("Error fetching playlist tracks:", tracksResult.status, tracksResult.statusText);
      }
    } catch (error) {
      console.error("Error during fetch:", error);
    }
  };

  const fetchAudioFeatures = async (trackIds) => {
    try {
      const featuresResult = await fetch(`https://api.spotify.com/v1/audio-features?ids=${trackIds.join(',')}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (featuresResult.ok) {
        const featuresData = await featuresResult.json();
        const filteredTracks = featuresData.audio_features.filter(
          feature => feature.danceability >= minSoundRange && feature.danceability <= maxSoundRange
        );
        setTrackFeatures(filteredTracks);
      } else {
        console.error("Error fetching audio features:", featuresResult.status, featuresResult.statusText);
      }
    } catch (error) {
      console.error("Error during fetch:", error);
    }
  };

  const generateNewPlaylist = async () => {
    try {
      const filteredTracks = trackFeatures.map(feature => 
        selectedPlaylistTracks.find(track => track.track.id === feature.id)
      );

      // Create the new playlist
      const createPlaylistResult = await fetch(`https://api.spotify.com/v1/users/${profileData.id}/playlists`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: `${selectedPlaylist.name} - Filtered`,
          public: true,
        }),
      });

      if (createPlaylistResult.ok) {
        const newPlaylistData = await createPlaylistResult.json();
        setNewPlaylistId(newPlaylistData.id);

        // Add filtered tracks to the new playlist
        const addTracksResult = await fetch(`https://api.spotify.com/v1/playlists/${newPlaylistData.id}/tracks`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            uris: filteredTracks.map(track => track.track.uri),
          }),
        });

        if (addTracksResult.ok) {
          console.log("New filtered playlist created successfully!");
        } else {
          console.error("Error adding tracks to the new playlist:", addTracksResult.status, addTracksResult.statusText);
        }

        // Set deleted songs for display
        setDeletedSongs(selectedPlaylistTracks.filter(track => !filteredTracks.includes(track)));
      } else {
        console.error("Error creating new playlist:", createPlaylistResult.status, createPlaylistResult.statusText);
      }
    } catch (error) {
      console.error("Error during fetch:", error);
    }
  };

  const handleGenerateNewPlaylist = () => {
    generateNewPlaylist();
  };

  const handlePlaylistChange = (event) => {
    const selectedPlaylistId = event.target.value;
    const selectedPlaylist = playlists.find(playlist => playlist.id === selectedPlaylistId);
    setSelectedPlaylist(selectedPlaylist);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    const fetchData = async () => {
      if (!code) {
        redirectToAuthCodeFlow(clientId);
      } else {
        const verifier = localStorage.getItem("verifier");

        const params = new URLSearchParams();
        params.append("client_id", clientId);
        params.append("grant_type", "authorization_code");
        params.append("code", code);
        params.append("redirect_uri", "http://localhost:3000/callback");
        params.append("code_verifier", verifier);

        try {
          const result = await fetch("https://accounts.spotify.com/api/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: params,
          });

          if (result.ok) {
            const { access_token } = await result.json();
            setAccessToken(access_token);
            const profile = await fetchProfile(access_token);

            if (profile) {
              populateUI(profile);
            }
          } else {
            console.error("Error fetching access token:", result.status, result.statusText);
          }
        } catch (error) {
          console.error("Error during fetch:", error);
        }
      }
    };

    fetchData();
  }, [clientId]);

  useEffect(() => {
    if (selectedPlaylist) {
      fetchPlaylistTracks(selectedPlaylist.id);
    }
  }, [selectedPlaylist]);

  return (
    <div className="container">
      {profileData && (
        <div className="content">
          <p className="profile-name">{profileData.display_name}</p>
          <h2 className="playlist-header">Select a Playlist:</h2>
          <select onChange={handlePlaylistChange}>

            <option value="" disabled>
              Select a playlist
            </option>
            {playlists.map((playlist) => (
              <option key={playlist.id} value={playlist.id}>
                {playlist.name}
              </option>
            ))}
          </select>
          {selectedPlaylist && (
            <div>
              <h3 className="selected-playlist-header">Selected Playlist:</h3>
              <p className="selected-playlist-name">{selectedPlaylist.name}</p>
              {/* "Generate Playlist" button */}
              <button className="generate-playlist-button" onClick={handleGenerateNewPlaylist}>
                Generate Playlist
              </button>
              {/* "Show Deleted Songs" button */}
              
              {newPlaylistId && (
                <div>
                  <h3 className="new-playlist-header">Cleansed Playlist:</h3>
                  <p className="new-playlist-id"> <a href={`https://open.spotify.com/playlist/${newPlaylistId}`} target="_blank" rel="noopener noreferrer">{`https://open.spotify.com/playlist/${newPlaylistId}`}</a></p>
                </div>
              )}
              {/* Display album covers for deleted songs */}
              {deletedSongs.length > 0 && (
                <div>
                  <h3 className="deleted-tracks-header">Deleted Tracks:</h3>
                  <ul className="deleted-tracks-list">
                    {deletedSongs.map((song) => (
                      <li key={song.track.id}>
                        <img src={song.track.album.images[0].url} alt={song.track.name} />
                        {song.track.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default App;
