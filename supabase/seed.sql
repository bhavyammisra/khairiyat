-- seed.sql — demo data
--
-- Without this, drift and refill runway have nothing to show and Beat 4 of the
-- demo falls flat. It creates 21 days of backdated history with realistic
-- imperfection: ~85% adherence, the evening dose sliding later across the three
-- weeks, and Amlodipine down to four days of stock.
--
-- Every member is created with user_id null, so this file has no auth
-- dependency. You sign up in the app and claim a profile with the join code —
-- which exercises the real claim flow instead of faking it.
--
-- Join code: RANA24
--
-- Safe to re-run: it clears the Rana Family first.

delete from families where join_code = 'RANA24';

do $$
declare
  v_tz     constant text := 'Asia/Kolkata';
  v_family uuid;
  v_sunita uuid;
  v_arjun  uuid;
  v_meera  uuid;
  v_amlo   uuid;
  v_today  date;
  m        record;
  t        time;
  i        int;
  ti       int;
  med_idx  int;
  d        date;
  v_sched  timestamptz;
  v_offset int;
  v_roll   int;
  v_state  dose_state;
  v_conf   timestamptz;
begin
  v_today := (now() at time zone v_tz)::date;

  insert into families (name, join_code)
  values ('Rana Family', 'RANA24')
  returning id into v_family;

  insert into members (family_id, name, role, phone, timezone)
  values (v_family, 'Sunita', 'care_recipient', '+919812345678', v_tz)
  returning id into v_sunita;

  insert into members (family_id, name, role, phone, timezone)
  values (v_family, 'Arjun', 'caregiver', '+919811110000', v_tz)
  returning id into v_arjun;

  insert into members (family_id, name, role, phone, timezone)
  values (v_family, 'Meera', 'caregiver', '+919822220000', v_tz)
  returning id into v_meera;

  -- Four tablets left at one a day. This is the refill runway line in Beat 4.
  insert into medications (member_id, name, dose_text, times, quantity_remaining, units_per_dose)
  values (v_sunita, 'Amlodipine', '5mg · 1 tablet', '{08:00}', 4, 1)
  returning id into v_amlo;

  insert into medications (member_id, name, dose_text, times, quantity_remaining, units_per_dose)
  values (v_sunita, 'Metformin', '500mg · 1 tablet', '{09:00,21:00}', 58, 1);

  insert into medications (member_id, name, dose_text, times, quantity_remaining, units_per_dose)
  values (v_sunita, 'Atorvastatin', '10mg · 1 tablet', '{21:00}', 44, 1);

  -- 21 days back, up to and including yesterday. Today is left alone so
  -- ensure_dose_windows generates it live on first app open.
  for i in 0..20 loop
    d := v_today - (21 - i);

    med_idx := 0;
    for m in
      select id, times from medications where member_id = v_sunita order by created_at
    loop
      med_idx := med_idx + 1;
      ti := 0;

      foreach t in array m.times loop
        ti := ti + 1;
        v_sched := (d::text || ' ' || t::text)::timestamp at time zone v_tz;

        -- The evening dose slides later week over week; the morning ones don't.
        -- Roughly flat for a fortnight, then steepening — which is what a real
        -- routine coming apart actually looks like, and gives the two 7-day
        -- windows in lib/doses.ts a difference worth reporting.
        if t >= time '20:00' then
          if i < 10 then
            v_offset := i;
          else
            v_offset := 10 + (i - 10) * 6;
          end if;
        else
          v_offset := 3 + (i % 4);
        end if;

        -- Deterministic so the demo is reproducible.
        --
        -- Sunita's day is four windows: Amlodipine 08:00, Metformin 09:00,
        -- Metformin 21:00, Atorvastatin 21:00. Adherence counts confirmed and
        -- resolved_taken alike, so only resolved_missed and unconfirmed pull
        -- the headline number down.
        --
        -- Metformin's evening dose (med_idx 2) is the drift carrier and stays
        -- pristine: lib/doses.ts needs 5 confirmed samples in EACH of two 7-day
        -- periods before it reports anything, and the rolling boundary can cost
        -- a sample depending on the hour the demo runs. Skipping more here
        -- silently kills Beat 4.
        --
        -- The other three slots run at 16/20 taken. That puts the headline at
        -- (0.8 + 0.8 + 1.0 + 0.8) / 4 = 85%, which is the number docs/SCHEMA.md
        -- specifies and the number that makes the dashboard look like a real
        -- family rather than a demo. Pinning the evening dose alone had pushed
        -- it to ~92%, which reads as a solved problem — and a solved problem is
        -- not worth building an app for.
        if t >= time '20:00' and med_idx = 2 then
          if i % 9 = 4 then
            v_state := 'resolved_taken';
            v_conf  := null;
          else
            v_state := 'confirmed';
            v_conf  := v_sched + make_interval(mins => v_offset);
          end if;
        else
          v_roll := (i * 7 + ti * 13 + med_idx * 5) % 20;

          if v_roll = 0 then
            v_state := 'resolved_taken';     -- she had taken it, just never tapped
            v_conf  := null;
          elsif v_roll = 1 then
            v_state := 'resolved_missed';
            v_conf  := null;
          elsif v_roll = 2 then
            v_state := 'unconfirmed';        -- nobody ever closed this one out
            v_conf  := null;
          elsif v_roll = 3 then
            v_state := 'resolved_missed';
            v_conf  := null;
          elsif v_roll = 4 then
            v_state := 'unconfirmed';
            v_conf  := null;
          else
            v_state := 'confirmed';
            v_conf  := v_sched + make_interval(mins => v_offset);
          end if;
        end if;

        insert into dose_windows (
          medication_id, member_id, family_id,
          scheduled_at, state, confirmed_at, source, resolved_by, resolved_at
        )
        values (
          m.id, v_sunita, v_family,
          v_sched, v_state, v_conf,
          case when v_state = 'confirmed' then 'nfc'::log_source else null end,
          case when v_state::text like 'resolved%' then v_arjun else null end,
          case when v_state::text like 'resolved%' then v_sched + interval '3 hours' else null end
        )
        on conflict (medication_id, scheduled_at) do nothing;
      end loop;
    end loop;
  end loop;

  -- The pill box sticker. Pre-write this token to the NTAG with NFC Tools if
  -- in-app tag writing gets cut: khairiyat://t/a7K2M9PqRs4T
  insert into tags (token, member_id, medication_id, label)
  values ('a7K2M9PqRs4T', v_sunita, v_amlo, 'Morning pill box');

  insert into emergency_info (member_id, blood_group, allergies, conditions, insurance_note)
  values (
    v_sunita,
    'B+',
    array['Penicillin', 'Sulfa drugs'],
    array['Hypertension', 'Type 2 diabetes'],
    'Star Health · policy SH-4471902 · renews March'
  );
end;
$$;
